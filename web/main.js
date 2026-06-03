// # ===== frontend/main.js =====
// 前端主逻辑：上传/波形绘制/缩放联动/侧边栏/状态栏

let originalXRange = null;
const allDivs = [];
let currentWaveform = null;
let currentAnalysisId = null;
let selectedChannels = [];
let currentTriggerOffsetSec = null;
let showTriggerMarker = true;
let overlayMode = false;
let hideStaticDigital = false;

let visibleCount = 5;

let plotCreationCounter = { total: 0, completed: 0 };
/** 最近一次在子图上的按键（0=左 2=右），用于双光标区分 C1/C2 */
let lastPlotPointerButton = 0;
let suppressTimeNavEvent = false;

/** 交互：默认框选缩放；可选平移；多子图 X 轴严格同步 */
let lastSyncedXRange = null;
let suppressPlotRelayoutSync = 0;
let waveDragMode = "zoom"; // zoom=框选放大 | pan=平移
let hoverRafId = null;
let pendingHoverText = undefined;

function isOverlayRelayoutNoise(eventData) {
    return (
        eventData["shapes"] !== undefined ||
        eventData["annotations"] !== undefined ||
        eventData.shapes !== undefined ||
        eventData.annotations !== undefined
    );
}

function resolvePlotDragmode() {
    if (typeof isDualCursorMode !== "undefined" && isDualCursorMode) return false;
    return waveDragMode === "pan" ? "pan" : "zoom";
}

function applyWaveDragmodeToAllPlots() {
    const dm = resolvePlotDragmode();
    allDivs.forEach((div) => {
        try {
            Plotly.relayout(div, { dragmode: dm });
        } catch (e) {
            /* ignore */
        }
    });
}

function setWaveDragMode(mode) {
    if (mode !== "pan" && mode !== "zoom") return;
    waveDragMode = mode;
    const btn = document.getElementById("btnTogglePan");
    if (btn) btn.classList.toggle("active", mode === "pan");
    applyWaveDragmodeToAllPlots();
    setStatus(mode === "pan" ? "平移模式：拖动波形浏览" : "框选模式：拖拽框选放大");
}

function toggleWavePanMode() {
    setWaveDragMode(waveDragMode === "pan" ? "zoom" : "pan");
}

/** 将所有子图 X 轴设为同一范围（精确同步） */
function applyXRangeToAllPlots(range, opts = {}) {
    if (!range || !allDivs.length) return Promise.resolve();
    const r = range.slice();
    lastSyncedXRange = r;
    suppressPlotRelayoutSync++;

    const update = { "xaxis.range": r };
    const tasks = allDivs.map((div) => {
        if (!div || !div.layout) return Promise.resolve();
        return Plotly.relayout(div, update);
    });

    return Promise.all(tasks)
        .then(() => {
            if (opts.refreshOverlays) refreshPlotOverlays();
            updateTimeNavigatorHint(r);
        })
        .finally(() => {
            suppressPlotRelayoutSync = Math.max(0, suppressPlotRelayoutSync - 1);
        });
}

/** 某一子图被用户拖动/框选后，立即同步其余子图 */
function handlePlotRelayout(sourceDiv, eventData) {
    if (suppressPlotRelayoutSync > 0) return;
    if (isOverlayRelayoutNoise(eventData)) return;
    const xRange = extractSyncedXRange(eventData);
    if (!xRange) return;

    lastSyncedXRange = xRange.slice();
    suppressPlotRelayoutSync++;

    const update = { "xaxis.range": xRange };
    const tasks = allDivs
        .filter((d) => d && d !== sourceDiv && d.layout)
        .map((d) => Plotly.relayout(d, update));

    Promise.all(tasks)
        .then(() => updateTimeNavigatorHint(xRange))
        .finally(() => {
            suppressPlotRelayoutSync = Math.max(0, suppressPlotRelayoutSync - 1);
        });
}

function updateTimeNavigatorHint(range) {
    const bar = document.getElementById("timeNavBar");
    const slider = document.getElementById("timeNavSlider");
    const hint = document.getElementById("timeNavHint");
    if (!bar || !slider || !hint || !originalXRange || !range) return;

    const fullW = originalXRange[1] - originalXRange[0];
    const winW = range[1] - range[0];
    if (fullW <= 0 || winW <= 0) return;

    if (winW >= fullW * 0.999) {
        bar.classList.add("hidden");
        return;
    }

    bar.classList.remove("hidden");
    const minStart = originalXRange[0];
    const maxStart = originalXRange[1] - winW;
    slider.min = String(minStart);
    slider.max = String(maxStart);
    slider.step = String(Math.max(winW / 300, fullW / 10000, 1e-9));

    suppressTimeNavEvent = true;
    slider.value = String(Math.max(minStart, Math.min(range[0], maxStart)));
    suppressTimeNavEvent = false;
    hint.textContent = `${range[0].toFixed(4)}s ~ ${range[1].toFixed(4)}s（全长 ${fullW.toFixed(4)}s）`;
}

function scheduleStatusCursor(text) {
    pendingHoverText = text;
    if (hoverRafId != null) return;
    hoverRafId = requestAnimationFrame(() => {
        hoverRafId = null;
        setStatusCursor(pendingHoverText);
    });
}

/** 将屏幕 X 坐标换算为当前子图时间轴上的值（优先 Plotly 内置换算） */
function clientXToPlotTime(div, clientX) {
    const fullLayout = div._fullLayout;
    if (!fullLayout || !fullLayout.xaxis) return null;
    const xaxis = fullLayout.xaxis;
    const rect = div.getBoundingClientRect();
    const xpx = clientX - rect.left;
    if (typeof Plotly !== "undefined" && Plotly.Axes && typeof Plotly.Axes.p2d === "function") {
        try {
            return Plotly.Axes.p2d(xaxis, xpx);
        } catch (e) {
            /* fall through */
        }
    }
    const axisOffset = xaxis._offset || 0;
    const axisLen = xaxis._length || 1;
    const rng = xaxis.range || xaxis._range || [0, 1];
    const ratio = (xpx - axisOffset) / axisLen;
    return rng[0] + ratio * (rng[1] - rng[0]);
}

/**
 * Plotly #5311：右键拖拽在 mouseup 时会触发错误缩放；阻止非左键进入 Plotly 拖拽层。
 * 双光标 C2 仍走 contextmenu，不受影响。
 */
function blockNonLeftPointerForPlotly(e) {
    if (e.button !== 0) {
        e.stopImmediatePropagation();
    }
}

/** 从 relayout 事件解析可同步的 X 范围（纠正倒置、过窄、越界） */
function extractSyncedXRange(eventData) {
    let r0;
    let r1;
    if (Array.isArray(eventData["xaxis.range"])) {
        [r0, r1] = eventData["xaxis.range"];
    } else if ("xaxis.range[0]" in eventData && "xaxis.range[1]" in eventData) {
        r0 = eventData["xaxis.range[0]"];
        r1 = eventData["xaxis.range[1]"];
    } else {
        return null;
    }
    if (!Number.isFinite(r0) || !Number.isFinite(r1)) return null;
    if (r0 > r1) {
        const t = r0;
        r0 = r1;
        r1 = t;
    }
    const width = r1 - r0;
    if (width <= 0) return null;
    if (originalXRange) {
        const fullWidth = originalXRange[1] - originalXRange[0];
        if (fullWidth > 0 && width < fullWidth * 1e-5) {
            return null;
        }
        r0 = Math.max(r0, originalXRange[0]);
        r1 = Math.min(r1, originalXRange[1]);
        if (r1 - r0 <= 0) return null;
    }
    return [r0, r1];
}


function getPlotHeight() {
    const container = document.getElementById("content");
    if (!container) return 200;
    const h = container.clientHeight;
    return Math.max(80, Math.floor(h / visibleCount) - 2);
}

function togglePageSizeMenu() {
    document.getElementById("pageSizeMenu").classList.toggle("hidden");
}

function setVisibleCount(count) {
    if (count === visibleCount) return;
    visibleCount = count;
    const btn = document.getElementById("pageSizeBtn");
    if (btn) btn.textContent = `每页 ${count} 子图 ▾`;

    setTimeout(() => {
        renderPlots();
    }, 50);

    document.getElementById("pageSizeMenu").classList.add("hidden");
}


// ===================== 文件上传 =====================
async function uploadFiles() {
    const cfg = document.getElementById('cfgFile').files[0];
    const dat = document.getElementById('datFile').files[0];

    if (!cfg || !dat) {
        alert("请上传 .cfg 和 .dat 文件！");
        return;
    }

    const formData = new FormData();
    formData.append("cfg", cfg);
    formData.append("dat", dat);

    setStatus("正在解析...");

    const res = await fetch("/upload", {
        method: "POST",
        body: formData
    });

    const data = await res.json();

    if (data.error) {
        alert("错误: " + data.error);
        setStatus("解析失败");
        return;
    }

    if (!data.analysisId) {
        alert("错误: 服务端未返回 analysisId");
        setStatus("解析失败");
        return;
    }

    currentAnalysisId = data.analysisId;
    displayMetadata(data.metadata);
    currentWaveform = data.waveform;
    currentTriggerOffsetSec =
        data && data.metadata && Number.isFinite(Number(data.metadata.triggerOffsetSec))
            ? Number(data.metadata.triggerOffsetSec)
            : null;
    originalXRange = null;
    lastSyncedXRange = null;

    if (typeof populateChannelList === "function") {
        populateChannelList(currentWaveform);
    }

    selectedChannels = Object.keys(currentWaveform.analog);
    renderPlots();

    if (typeof populateAnalysisChannelSelectors === "function") {
        populateAnalysisChannelSelectors();
    }

    // 更新状态栏
    const meta = data.metadata;
    setStatusFile(`${meta.stationName || '未知'} | ${meta.analogChannels}A + ${meta.digitalChannels}D | ${meta.total_samples} 点`);
    setStatus("解析完成");
}

function displayMetadata(meta) {
    const el = document.getElementById("metadata");
    if (!el) return;
    el.innerHTML = `
        <div class="meta-row"><span>变电站</span><span>${meta.stationName}</span></div>
        <div class="meta-row"><span>设备ID</span><span>${meta.recDevId}</span></div>
        <div class="meta-row"><span>版本</span><span>${meta.revYear}</span></div>
        <div class="meta-row"><span>模拟/数字/总</span><span>${meta.analogChannels}A / ${meta.digitalChannels}D / ${meta.totalChannels}</span></div>
        <div class="meta-row"><span>频率</span><span>${meta.frequency} Hz</span></div>
        <div class="meta-row"><span>采样率</span><span>${meta.samplingRates ? meta.samplingRates[0][0] + ' Hz' : '—'}</span></div>
        <div class="meta-row"><span>采样点数</span><span>${meta.total_samples}</span></div>
        <div class="meta-row"><span>开始时间</span><span>${meta.startTime}</span></div>
        <div class="meta-row"><span>触发时间</span><span>${meta.triggerTime}</span></div>
        <div class="meta-row"><span>文件格式</span><span>${meta.fileFormat}</span></div>
    `;
}


// ===================== 波形绘制 =====================
function renderPlots() {
    const container = document.getElementById("plots");

    let currentXRange = null;
    if (allDivs.length > 0) {
        try {
            const firstDiv = allDivs[0];
            const layout = firstDiv.layout;
            if (layout && layout.xaxis && layout.xaxis.range) {
                currentXRange = layout.xaxis.range.slice();
            }
        } catch (e) {
            console.warn("无法获取当前缩放状态", e);
        }
    }

    container.innerHTML = "";
    allDivs.length = 0;

    if (!currentWaveform || !selectedChannels.length) {
        hideTimeNavigator();
        container.innerHTML = `
            <div class="placeholder">
                <div class="placeholder-icon">📊</div>
                <div class="placeholder-text">上传 .cfg + .dat 文件开始分析</div>
            </div>`;
        return;
    }

    const time = currentWaveform.time;
    if (!originalXRange) {
        originalXRange = [Math.min(...time), Math.max(...time)];
        lastSyncedXRange = originalXRange.slice();
    }

    if (overlayMode) {
        renderOverlayPlot(container, time, currentXRange);
        return;
    }

    plotCreationCounter.total = 0;
    plotCreationCounter.completed = 0;

    Object.keys(currentWaveform.analog).forEach(chName => {
        if (selectedChannels.includes(chName)) plotCreationCounter.total++;
    });
    Object.keys(currentWaveform.digital || {}).forEach(chName => {
        if (selectedChannels.includes(chName) && shouldShowDigitalChannel(chName)) {
            plotCreationCounter.total++;
        }
    });

    Object.keys(currentWaveform.analog).forEach(chName => {
        if (!selectedChannels.includes(chName)) return;
        createPlotDiv(container, time, currentWaveform.analog[chName], chName);
    });

    Object.keys(currentWaveform.digital || {}).forEach(chName => {
        if (!selectedChannels.includes(chName)) return;
        if (!shouldShowDigitalChannel(chName)) return;
        createPlotDiv(container, time, currentWaveform.digital[chName], chName, true);
    });

    if (currentXRange) {
        window.restoreZoomAfterAllPlots = () => {
            applyXRangeToAllPlots(currentXRange);
        };
    }
}

/** 当前可见 X 范围（优先用子图缩放，避免切换标注时误改范围） */
function getCurrentVisibleXRange() {
    const first = allDivs.find(
        (d) => d && d.layout && d.layout.xaxis && d.layout.xaxis.range
    );
    if (first) return first.layout.xaxis.range.slice();
    if (originalXRange) return originalXRange.slice();
    return null;
}

/** 触发点竖线/标注（与双光标共用 shapes，避免 relayout 互相覆盖） */
function getTriggerMarkerOverlays() {
    const visibleX = getCurrentVisibleXRange();
    if (
        !showTriggerMarker ||
        currentTriggerOffsetSec == null ||
        !Number.isFinite(currentTriggerOffsetSec) ||
        !visibleX ||
        currentTriggerOffsetSec < visibleX[0] ||
        currentTriggerOffsetSec > visibleX[1]
    ) {
        return { shapes: [], annotations: [] };
    }
    const t = currentTriggerOffsetSec;
    return {
        shapes: [{
            type: "line",
            x0: t,
            x1: t,
            y0: 0,
            y1: 1,
            xref: "x",
            yref: "paper",
            line: { color: "#f59e0b", width: 1.5, dash: "dot" },
        }],
        annotations: [{
            x: t,
            y: 1,
            xref: "x",
            yref: "paper",
            text: "触发点",
            showarrow: false,
            yanchor: "bottom",
            bgcolor: "rgba(245,158,11,0.85)",
            bordercolor: "#f59e0b",
            borderwidth: 1,
            font: { size: 9, color: "white" },
        }],
    };
}

/** 统一刷新触发点 + 双光标（不重建子图，保留缩放范围） */
function refreshPlotOverlays() {
    const trig = getTriggerMarkerOverlays();
    allDivs.forEach((div) => {
        if (!div || !div.data || !div.data.length) return;
        const dual =
            typeof buildDualCursorOverlaysForDiv === "function"
                ? buildDualCursorOverlaysForDiv(div)
                : { shapes: [], annotations: [] };
        const update = {
            shapes: trig.shapes.concat(dual.shapes),
            annotations: trig.annotations.concat(dual.annotations),
        };
        if (div.layout && div.layout.xaxis && div.layout.xaxis.range) {
            update["xaxis.range"] = div.layout.xaxis.range.slice();
        }
        Plotly.relayout(div, update).catch(() => {});
    });
}

function renderOverlayPlot(container, time, savedXRange) {
    const wrapper = document.createElement("div");
    wrapper.className = "plot-wrapper";
    container.appendChild(wrapper);

    const div = document.createElement("div");
    wrapper.appendChild(div);

    wrapper.addEventListener("mousedown", blockNonLeftPointerForPlotly, true);
    wrapper.addEventListener("mouseup", blockNonLeftPointerForPlotly, true);
    wrapper.addEventListener("mousedown", (e) => {
        lastPlotPointerButton = e.button;
    });

    const analogSelected = selectedChannels.filter((ch) => ch in (currentWaveform.analog || {}));
    if (!analogSelected.length) {
        container.innerHTML = `
            <div class="placeholder">
                <div class="placeholder-icon">📊</div>
                <div class="placeholder-text">叠加模式仅支持模拟量通道</div>
                <div class="placeholder-sub">请在左侧“模拟通道”中选择至少 1 路</div>
            </div>`;
        return;
    }

    const traces = analogSelected.map((chName) => ({
        x: time,
        y: currentWaveform.analog[chName],
        mode: "lines",
        line: { width: 1.1 },
        name: chName,
    }));

    const layout = {
        height: Math.max(220, getPlotHeight() * Math.min(visibleCount, 3)),
        margin: { l: 55, r: 8, t: 24, b: 30 },
        xaxis: { range: originalXRange ? originalXRange.slice() : undefined },
        yaxis: { title: { text: "叠加模式（模拟量）", standoff: 2, font: { size: 11 } } },
        showlegend: true,
        legend: { orientation: "h", x: 0, y: -0.15, font: { size: 10 } },
        dragmode: resolvePlotDragmode()
    };

    Plotly.newPlot(div, traces, layout, { displayModeBar: false, responsive: true, scrollZoom: false }).then(() => {
        allDivs.push(div);

        const rangeToRestore = savedXRange || (originalXRange ? originalXRange.slice() : null);
        const afterRange = () => {
            refreshPlotOverlays();
            updateTimeNavigator();
        };
        if (rangeToRestore) {
            Plotly.relayout(div, { "xaxis.range": rangeToRestore }).then(afterRange).catch(afterRange);
        } else {
            afterRange();
        }

        // 缩放联动（叠加模式：只有一个图，仍保持 currentXRange）
        div.on("plotly_relayout", (eventData) => {
            handlePlotRelayout(div, eventData);
        });

        // 双光标 C1/C2
        div.on("plotly_click", (event) => {
            if (typeof isDualCursorMode !== "undefined" && isDualCursorMode) {
                handleDualCursorClick(event, "C1");
            }
        });
        div.addEventListener("contextmenu", (e) => {
            if (!isDualCursorMode) return;
            e.preventDefault();
            e.stopPropagation();
            const xValue = clientXToPlotTime(div, e.clientX);
            if (xValue == null) return;
            const first = traces[0];
            const yValue = getYValueAtX(first.x, first.y, xValue);
            handleDualCursorClick({ points: [{ x: xValue, y: yValue }] }, "C2");
        });
    });
}

function createPlotDiv(container, time, values, channelName, isDigital = false) {
    const wrapper = document.createElement("div");
    wrapper.className = "plot-wrapper";
    container.appendChild(wrapper);

    const div = document.createElement("div");
    wrapper.appendChild(div);

    wrapper.addEventListener("mousedown", blockNonLeftPointerForPlotly, true);
    wrapper.addEventListener("mouseup", blockNonLeftPointerForPlotly, true);
    wrapper.addEventListener("mousedown", (e) => {
        lastPlotPointerButton = e.button;
    });

    const maxFontSize = 14;
    const minFontSize = 8;
    const baseLength = 10;
    const dynamicFontSize = Math.max(
        minFontSize,
        Math.min(maxFontSize, (baseLength / channelName.length) * maxFontSize)
    );

    const trace = {
        x: time,
        y: values,
        mode: 'lines',
        line: { width: isDigital ? 1.5 : 0.8, shape: isDigital ? "hv" : "linear" },
        name: channelName,
        color: isDigital ? '#2c3e50' : null
    };

    const layout = {
        height: getPlotHeight(),
        margin: { l: 55, r: 8, t: 22, b: 4 },
        yaxis: {
            title: {
                text: channelName,
                standoff: 2,
                font: { size: dynamicFontSize }
            },
            range: isDigital ? [-0.5, 1.5] : undefined
        },
        xaxis: {
            title: null,
            showticklabels: false,
            ticks: "",
            range: originalXRange ? originalXRange.slice() : undefined
        },
        showlegend: false,
        dragmode: resolvePlotDragmode()
    };

    Plotly.newPlot(div, [trace], layout, {
        responsive: true,
        displayModeBar: false,
        doubleClick: false,
        scrollZoom: false
    }).then(() => {
        div.on("plotly_relayout", (eventData) => {
            handlePlotRelayout(div, eventData);
        });

        div.on("plotly_click", (event) => {
            if (!event.points || !event.points.length) return;
            if (typeof isDualCursorMode !== "undefined" && isDualCursorMode) {
                if (lastPlotPointerButton !== 0) return;
                handleDualCursorClick(event, "C1");
            }
        });

        div.on("plotly_hover", (ev) => {
            if (!ev.points || !ev.points.length) return;
            const p = ev.points[0];
            const ch = (div.data && div.data[0] && div.data[0].name) || "";
            const label = ch ? `${ch} ` : "";
            scheduleStatusCursor(`${label}t=${Number(p.x).toFixed(6)}s y=${Number(p.y).toFixed(4)}`);
        });
        div.on("plotly_unhover", () => scheduleStatusCursor(null));

        div.addEventListener("contextmenu", (e) => {
            if (!isDualCursorMode) return;
            e.preventDefault();
            e.stopPropagation();
            const xVal = clientXToPlotTime(div, e.clientX);
            const trace = div.data && div.data[0];
            if (xVal == null || !trace || !trace.x) return;
            const time = trace.x;
            let nearestIdx = 0;
            let minDiff = Infinity;
            for (let i = 0; i < time.length; i++) {
                const diff = Math.abs(time[i] - xVal);
                if (diff < minDiff) {
                    minDiff = diff;
                    nearestIdx = i;
                }
            }
            handleDualCursorClick(
                { points: [{ x: time[nearestIdx], y: trace.y[nearestIdx] }] },
                "C2"
            );
        });

        allDivs.push(div);

        plotCreationCounter.completed++;
        if (plotCreationCounter.completed === plotCreationCounter.total) {
            setTimeout(() => {
                if (typeof window.restoreZoomAfterAllPlots === "function") {
                    window.restoreZoomAfterAllPlots();
                    delete window.restoreZoomAfterAllPlots;
                }
                refreshPlotOverlays();
                updateTimeNavigator();
            }, 0);
        }
    });
}

/** 开关量是否发生过 0/1（或等效）变位 */
function digitalChannelHasTransition(values) {
    if (!values || values.length < 2) return false;
    const v0 = Number(values[0]);
    for (let i = 1; i < values.length; i++) {
        if (Number(values[i]) !== v0) return true;
    }
    return false;
}

function shouldShowDigitalChannel(chName) {
    if (!hideStaticDigital || !currentWaveform || !currentWaveform.digital) return true;
    const values = currentWaveform.digital[chName];
    return digitalChannelHasTransition(values);
}

function refreshDigitalListFilter() {
    const list = document.getElementById("digitalChannelList");
    if (!list || !currentWaveform || !currentWaveform.digital) return;

    const searchInput = document.getElementById("channelSearch");
    const keyword = searchInput ? searchInput.value.trim().toLowerCase() : "";

    list.querySelectorAll("label").forEach((label) => {
        const cb = label.querySelector("input[type=checkbox]");
        if (!cb) return;
        const name = cb.value;
        const values = currentWaveform.digital[name];
        const isStatic = values && !digitalChannelHasTransition(values);

        if (hideStaticDigital && isStatic) {
            label.style.display = "none";
            cb.checked = false;
            selectedChannels = selectedChannels.filter((c) => c !== name);
            return;
        }

        const text = label.textContent.toLowerCase();
        label.style.display = !keyword || text.includes(keyword) ? "flex" : "none";
    });
}

function setHideStaticDigital(next) {
    hideStaticDigital = Boolean(next);
    const btn = document.getElementById("btnHideStaticDigital");
    if (btn) btn.classList.toggle("active", hideStaticDigital);
    refreshDigitalListFilter();
    renderPlots();
    setStatus(hideStaticDigital ? "已隐藏无变位开关量" : "显示全部开关量");
}

function downloadDataUrl(filename, dataUrl) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
}

async function exportPng() {
    if (!allDivs.length) {
        alert("请先上传并显示波形");
        return;
    }
    const btn = document.getElementById("btnExportPng");
    if (btn) btn.disabled = true;
    setStatus("正在生成 PNG…");

    try {
        const snapshots = [];
        for (let i = 0; i < allDivs.length; i++) {
            const div = allDivs[i];
            const w = Math.max(320, div.offsetWidth || 600);
            const h = Math.max(100, div.offsetHeight || 180);
            const scale = 2;
            const dataUrl = await Plotly.toImage(div, {
                format: "png",
                width: w * scale,
                height: h * scale,
            });
            const chName =
                (div.data && div.data[0] && div.data[0].name) ||
                (div.data && div.data.length > 1 ? "overlay" : `plot_${i + 1}`);
            snapshots.push({ dataUrl, width: w * scale, height: h * scale, name: chName });
        }

        const ts = new Date();
        const stamp = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, "0")}${String(ts.getDate()).padStart(2, "0")}_${String(ts.getHours()).padStart(2, "0")}${String(ts.getMinutes()).padStart(2, "0")}`;

        if (snapshots.length === 1) {
            downloadDataUrl(`comtrade_waveform_${stamp}.png`, snapshots[0].dataUrl);
            setStatus("PNG 已导出");
            return;
        }

        const maxW = Math.max(...snapshots.map((s) => s.width));
        const totalH = snapshots.reduce((sum, s) => sum + s.height, 0);
        const canvas = document.createElement("canvas");
        canvas.width = maxW;
        canvas.height = totalH;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, maxW, totalH);

        let y = 0;
        for (const snap of snapshots) {
            const img = await new Promise((resolve, reject) => {
                const el = new Image();
                el.onload = () => resolve(el);
                el.onerror = reject;
                el.src = snap.dataUrl;
            });
            ctx.drawImage(img, 0, y, snap.width, snap.height);
            y += snap.height;
        }

        const mergedUrl = canvas.toDataURL("image/png");
        downloadDataUrl(`comtrade_waveform_${stamp}.png`, mergedUrl);
        setStatus(`PNG 已导出（${snapshots.length} 个子图合并）`);
    } catch (e) {
        console.error(e);
        alert("PNG 导出失败：" + (e.message || e));
        setStatus("PNG 导出失败");
    } finally {
        if (btn) btn.disabled = false;
    }
}

function exportCsv() {
    if (!currentWaveform || !currentWaveform.time) {
        alert("请先上传并解析 COMTRADE 文件");
        return;
    }
    const time = currentWaveform.time;
    const analogKeys = Object.keys(currentWaveform.analog || {});
    const digitalKeys = Object.keys(currentWaveform.digital || {});

    const analogSelected = selectedChannels.filter((c) => analogKeys.includes(c));
    const digitalSelected = selectedChannels.filter((c) => digitalKeys.includes(c));
    const selected = [...analogSelected, ...digitalSelected];

    if (!selected.length) {
        alert("请先在左侧勾选需要导出的通道");
        return;
    }

    const esc = (s) => {
        const str = String(s ?? "");
        if (/[\",\n]/.test(str)) return `\"${str.replace(/\"/g, '\"\"')}\"`;
        return str;
    };

    const header = ["time_s", ...selected].map(esc).join(",");
    const lines = [header];
    for (let i = 0; i < time.length; i++) {
        const row = [time[i]];
        for (const ch of selected) {
            const arr =
                (currentWaveform.analog && currentWaveform.analog[ch]) ||
                (currentWaveform.digital && currentWaveform.digital[ch]) ||
                [];
            row.push(arr[i]);
        }
        lines.push(row.map(esc).join(","));
    }

    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ts = new Date();
    const yyyy = ts.getFullYear();
    const mm = String(ts.getMonth() + 1).padStart(2, "0");
    const dd = String(ts.getDate()).padStart(2, "0");
    a.href = url;
    a.download = `comtrade_export_${yyyy}${mm}${dd}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function setOverlayMode(next) {
    overlayMode = Boolean(next);
    const btn = document.getElementById("btnToggleOverlay");
    if (btn) btn.classList.toggle("active", overlayMode);
    renderPlots();
}

function setTriggerMarkerVisible(next) {
    showTriggerMarker = Boolean(next);
    const btn = document.getElementById("btnToggleTrigger");
    if (btn) btn.classList.toggle("active", showTriggerMarker);
    // 只刷新标注层，不 renderPlots()，避免清掉双光标且改变缩放范围
    refreshPlotOverlays();
}


// ===================== 缩放控制 =====================
function hideTimeNavigator() {
    const bar = document.getElementById("timeNavBar");
    if (bar) bar.classList.add("hidden");
}

function updateTimeNavigator() {
    const bar = document.getElementById("timeNavBar");
    const slider = document.getElementById("timeNavSlider");
    const hint = document.getElementById("timeNavHint");
    if (!bar || !slider || !originalXRange || !allDivs.length) {
        hideTimeNavigator();
        return;
    }

    const curr = getCurrentVisibleXRange();
    if (!curr) {
        hideTimeNavigator();
        return;
    }

    const fullW = originalXRange[1] - originalXRange[0];
    const winW = curr[1] - curr[0];
    if (fullW <= 0 || winW <= 0) {
        hideTimeNavigator();
        return;
    }

    // 全时段显示时不显示滑块
    if (winW >= fullW * 0.999) {
        hideTimeNavigator();
        return;
    }

    bar.classList.remove("hidden");
    const minStart = originalXRange[0];
    const maxStart = originalXRange[1] - winW;
    slider.min = String(minStart);
    slider.max = String(maxStart);
    slider.step = String(Math.max(winW / 300, fullW / 10000, 1e-9));

    suppressTimeNavEvent = true;
    slider.value = String(Math.max(minStart, Math.min(curr[0], maxStart)));
    suppressTimeNavEvent = false;

    if (hint) {
        hint.textContent = `${curr[0].toFixed(4)}s ~ ${curr[1].toFixed(4)}s（全长 ${fullW.toFixed(4)}s）`;
    }
}

function panToTimeStart(start) {
    const curr = lastSyncedXRange || getCurrentVisibleXRange();
    if (!curr || !originalXRange || !allDivs.length) return;

    const winW = curr[1] - curr[0];
    const minStart = originalXRange[0];
    const maxStart = originalXRange[1] - winW;
    const s = Math.max(minStart, Math.min(Number(start), maxStart));
    const newRange = [s, s + winW];

    updateTimeNavigatorHint(newRange);
    applyXRangeToAllPlots(newRange);
}

function onTimeNavInput(e) {
    if (suppressTimeNavEvent) return;
    panToTimeStart(e.target.value);
}

function resetZoom() {
    if (!allDivs.length) return;
    suppressPlotRelayoutSync++;
    const range = originalXRange ? originalXRange.slice() : null;
    const tasks = allDivs.map((div) => {
        const trace = div.data && div.data[0];
        const isDig = trace && trace.line && trace.line.shape === "hv";
        const update = {};
        if (range) {
            update["xaxis.range"] = range;
            update["xaxis.autorange"] = false;
        } else {
            update["xaxis.autorange"] = true;
        }
        if (!isDig) update["yaxis.autorange"] = true;
        else update["yaxis.range"] = [-0.5, 1.5];
        return Plotly.relayout(div, update);
    });
    Promise.all(tasks).then(() => {
        if (range) lastSyncedXRange = range.slice();
        else lastSyncedXRange = null;
        refreshPlotOverlays();
        updateTimeNavigator();
        setStatus("已重置为全时段");
    }).finally(() => {
        suppressPlotRelayoutSync = Math.max(0, suppressPlotRelayoutSync - 1);
    });
}

function zoomIn() {
    if (!allDivs.length) return;
    applyZoom(1 / 1.5);  // 因子<1 → 显示范围变小 → 放大
}

function zoomOut() {
    if (!allDivs.length) return;
    applyZoom(1.5);       // 因子>1 → 显示范围变大 → 缩小
}

function applyZoom(factor) {
    const firstDiv = allDivs[0];
    if (!firstDiv || !firstDiv.layout || !firstDiv.layout.xaxis || !firstDiv.layout.xaxis.range) return;

    const curr = firstDiv.layout.xaxis.range.slice();
    const center = (curr[0] + curr[1]) / 2;
    const width = curr[1] - curr[0];
    const newWidth = width * factor;

    if (originalXRange) {
        if (newWidth >= (originalXRange[1] - originalXRange[0])) {
            resetZoom();
            return;
        }
    }

    const minWidth = 0.0001;
    if (newWidth < minWidth) return;

    let newRange = [center - newWidth / 2, center + newWidth / 2];

    if (originalXRange) {
        if (newRange[0] < originalXRange[0]) { newRange[0] = originalXRange[0]; newRange[1] = newRange[0] + newWidth; }
        if (newRange[1] > originalXRange[1]) { newRange[1] = originalXRange[1]; newRange[0] = newRange[1] - newWidth; }
    }

    lastSyncedXRange = newRange.slice();
    applyXRangeToAllPlots(newRange).then(() => updateTimeNavigator());
}


// ===================== 稳定布局 =====================
function stabilizeLayout() {
    if (allDivs.length === 0) return;
    const height = getPlotHeight();
    Promise.all(allDivs.map(div => {
        if (!div || !div.layout) return Promise.resolve();
        return Plotly.relayout(div, { height: height });
    }));
}


// ===================== 侧边栏控制 =====================
// 桌面端折叠
let sidebarCollapsed = false;

function toggleSidebar() {
    const sidebar = document.getElementById("sidebar");
    if (!sidebar) return;

    // 移动端横屏行为
    if (window.matchMedia("(max-width: 900px) and (orientation: landscape)").matches) {
        sidebar.classList.toggle("open");
        const overlay = document.getElementById("sidebarOverlay");
        overlay.style.display = sidebar.classList.contains("open") ? "block" : "none";
        return;
    }

    sidebarCollapsed = !sidebarCollapsed;
    sidebar.classList.toggle("collapsed");
}

// 状态栏
function setStatus(msg) {
    const el = document.getElementById("statusInfo");
    if (el) el.textContent = msg;
}

function setStatusFile(msg) {
    const el = document.getElementById("statusFile");
    if (el) el.textContent = msg;
}

function setStatusCursor(text) {
    const el = document.getElementById("statusCursor");
    if (!el) return;
    el.textContent = text ? `光标: ${text}` : "光标: —";
}

// 工具函数：根据 x 查 y
function getYValueAtX(timeArray, valueArray, x) {
    let idx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < timeArray.length; i++) {
        const diff = Math.abs(timeArray[i] - x);
        if (diff < minDiff) { minDiff = diff; idx = i; }
    }
    return valueArray[idx];
}


// ===================== 事件绑定 =====================
document.addEventListener("DOMContentLoaded", () => {
    const toggleBtn = document.getElementById("toggleSidebar");
    if (toggleBtn) {
        toggleBtn.addEventListener("click", toggleSidebar);
    }

    const overlay = document.getElementById("sidebarOverlay");
    if (overlay) {
        overlay.addEventListener("click", () => {
            document.getElementById("sidebar").classList.remove("open");
            overlay.style.display = "none";
        });
    }

    // 子图数量选择
    const pageSizeBtn = document.getElementById("pageSizeBtn");
    const pageSizeMenu = document.getElementById("pageSizeMenu");
    if (pageSizeBtn && pageSizeMenu) {
        pageSizeMenu.querySelectorAll("li").forEach(li => {
            li.addEventListener("click", () => {
                setVisibleCount(Number(li.dataset.size));
                pageSizeMenu.classList.add("hidden");
            });
        });
        document.addEventListener("click", (e) => {
            if (!pageSizeBtn.contains(e.target) && !pageSizeMenu.contains(e.target)) {
                pageSizeMenu.classList.add("hidden");
            }
        });
    }

    // 窗口调整
    window.addEventListener('resize', () => {
        clearTimeout(window.resizeTimer);
        window.resizeTimer = setTimeout(() => {
            if (allDivs.length > 0) {
                stabilizeLayout();
            }
        }, 250);
    });

    // 触发点开关（默认开启）
    setTriggerMarkerVisible(true);
    const btnTrigger = document.getElementById("btnToggleTrigger");
    if (btnTrigger) {
        btnTrigger.addEventListener("click", () => setTriggerMarkerVisible(!showTriggerMarker));
    }

    // 叠加模式（默认关闭）
    setOverlayMode(false);
    const btnOverlay = document.getElementById("btnToggleOverlay");
    if (btnOverlay) {
        btnOverlay.addEventListener("click", () => setOverlayMode(!overlayMode));
    }

    // PNG / CSV 导出
    const btnPng = document.getElementById("btnExportPng");
    if (btnPng) btnPng.addEventListener("click", exportPng);

    const btnCsv = document.getElementById("btnExportCsv");
    if (btnCsv) btnCsv.addEventListener("click", exportCsv);

    const btnHideStatic = document.getElementById("btnHideStaticDigital");
    if (btnHideStatic) {
        btnHideStatic.addEventListener("click", () => setHideStaticDigital(!hideStaticDigital));
    }

    const timeNavSlider = document.getElementById("timeNavSlider");
    if (timeNavSlider) {
        timeNavSlider.addEventListener("input", onTimeNavInput);
    }

    const btnPan = document.getElementById("btnTogglePan");
    if (btnPan) {
        btnPan.addEventListener("click", toggleWavePanMode);
    }
    setWaveDragMode("zoom");
});
