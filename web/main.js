// # ===== frontend/main.js =====
// 前端主逻辑：上传/波形绘制/缩放联动/侧边栏/状态栏

let originalXRange = null;
const allDivs = [];
let isSyncing = false;
let currentWaveform = null;
let selectedChannels = [];

let visibleCount = 5;

let globalCursorX = null;
let isCursorModeEnabled = false;

let pendingRelayout = null;
let plotCreationCounter = { total: 0, completed: 0 };


function getPlotHeight() {
    const container = document.getElementById("content");
    if (!container) return 200;
    const h = container.clientHeight;
    return Math.max(100, Math.floor(h / visibleCount));
}

function togglePageSizeMenu() {
    document.getElementById("pageSizeMenu").classList.toggle("hidden");
}

function setVisibleCount(count) {
    if (count === visibleCount) return;
    visibleCount = count;
    const btn = document.getElementById("pageSizeBtn");
    if (btn) btn.textContent = `每页 ${count} 个 ▾`;

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

    displayMetadata(data.metadata);
    currentWaveform = data.waveform;
    originalXRange = null;

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

    if (pendingRelayout) {
        clearTimeout(pendingRelayout);
        pendingRelayout = null;
    }

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
    }

    plotCreationCounter.total = 0;
    plotCreationCounter.completed = 0;

    Object.keys(currentWaveform.analog).forEach(chName => {
        if (selectedChannels.includes(chName)) plotCreationCounter.total++;
    });
    Object.keys(currentWaveform.digital || {}).forEach(chName => {
        if (selectedChannels.includes(chName)) plotCreationCounter.total++;
    });

    Object.keys(currentWaveform.analog).forEach(chName => {
        if (!selectedChannels.includes(chName)) return;
        createPlotDiv(container, time, currentWaveform.analog[chName], chName);
    });

    Object.keys(currentWaveform.digital || {}).forEach(chName => {
        if (!selectedChannels.includes(chName)) return;
        createPlotDiv(container, time, currentWaveform.digital[chName], chName, true);
    });

    if (currentXRange) {
        window.restoreZoomAfterAllPlots = () => {
            allDivs.forEach(div => {
                if (div && div.layout) {
                    Plotly.relayout(div, { 'xaxis.range': currentXRange });
                }
            });
            if (isCursorModeEnabled && globalCursorX !== null) {
                setTimeout(() => applyGlobalCursorLine(globalCursorX), 50);
            }
        };
    }
}

function createPlotDiv(container, time, values, channelName, isDigital = false) {
    const RELAYOUT_DEBOUNCE_MS = 60;

    const wrapper = document.createElement("div");
    wrapper.className = "plot-wrapper";
    container.appendChild(wrapper);

    const div = document.createElement("div");
    wrapper.appendChild(div);

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
        margin: { l: 60, r: 10, t: 6, b: 8 },
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
        showlegend: false
    };

    Plotly.newPlot(div, [trace], layout, {
        responsive: true,
        displayModeBar: false,
        doubleClick: false
    }).then(() => {
        div.on('plotly_relayout', (eventData) => {
            if (eventData['shapes'] !== undefined || eventData['annotations'] !== undefined) return;
            if (isSyncing) return;

            if (pendingRelayout) clearTimeout(pendingRelayout);

            pendingRelayout = setTimeout(() => {
                const update = {};
                if ('xaxis.range[0]' in eventData && 'xaxis.range[1]' in eventData) {
                    update['xaxis.range'] = [eventData['xaxis.range[0]'], eventData['xaxis.range[1]']];
                }
                if (!isDigital && 'yaxis.range[0]' in eventData && 'yaxis.range[1]' in eventData) {
                    update['yaxis.range'] = [eventData['yaxis.range[0]'], eventData['yaxis.range[1]']];
                }
                if (Object.keys(update).length === 0) return;

                isSyncing = true;
                Promise.all(allDivs.map(d => d !== div ? Plotly.relayout(d, update) : Promise.resolve())).then(() => {
                    isSyncing = false;
                    if (isCursorModeEnabled && globalCursorX !== null) {
                        requestAnimationFrame(() => applyGlobalCursorLine(globalCursorX));
                    }
                });
            }, RELAYOUT_DEBOUNCE_MS);
        });

        div.on("plotly_click", (event) => {
            if (!event.points || !event.points.length) return;

            // 双光标优先
            if (typeof isDualCursorMode !== 'undefined' && isDualCursorMode) {
                handleDualCursorClick(event);
                return;
            }

            if (!isCursorModeEnabled) return;
            const xValue = event.points[0].x;
            const yValue = event.points[0].y;
            globalCursorX = xValue;
            applyGlobalCursorLine(xValue);
            updateCursorStatus(xValue, yValue);
        });

        allDivs.push(div);

        plotCreationCounter.completed++;
        if (plotCreationCounter.completed === plotCreationCounter.total) {
            if (typeof window.restoreZoomAfterAllPlots === 'function') {
                setTimeout(() => {
                    window.restoreZoomAfterAllPlots();
                    delete window.restoreZoomAfterAllPlots;
                }, 0);
            }
        }
    });
}


// ===================== 缩放控制 =====================
function resetZoom() {
    if (!allDivs.length) return;
    isSyncing = true;
    allDivs.forEach(div => {
        const trace = div.data && div.data[0];
        const isDig = trace && trace.line && trace.line.shape === 'hv';
        const update = { 'xaxis.autorange': true };
        if (!isDig) update['yaxis.autorange'] = true;
        else update['yaxis.range'] = [-0.5, 1.5];
        Plotly.relayout(div, update);
    });
    isSyncing = false;
    if (isCursorModeEnabled && globalCursorX !== null) {
        setTimeout(() => applyGlobalCursorLine(globalCursorX), 50);
    }
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

    isSyncing = true;
    Promise.all(allDivs.map(div => Plotly.relayout(div, { 'xaxis.range': newRange }))).then(() => {
        isSyncing = false;
        if (isCursorModeEnabled && globalCursorX !== null) {
            setTimeout(() => applyGlobalCursorLine(globalCursorX), 50);
        }
    });
}


// ===================== 参考线模式 =====================
function toggleCursorMode() {
    isCursorModeEnabled = !isCursorModeEnabled;
    const btn = document.getElementById("cursorToggleBtn");
    if (!btn) return;
    btn.classList.toggle("active");

    if (!isCursorModeEnabled) {
        globalCursorX = null;
        allDivs.forEach(div => {
            if (div && div.layout) Plotly.relayout(div, { shapes: [], annotations: [] });
        });
        updateCursorStatus(null, null);
    }
}

function applyGlobalCursorLine(xValue) {
    const updates = allDivs.map(div => {
        if (!div || !div.data || !div.data[0]) return Promise.resolve();
        const trace = div.data[0];
        const time = trace.x;
        const values = trace.y;
        const yValue = getYValueAtX(time, values, xValue);

        return Plotly.relayout(div, {
            shapes: [{
                type: "line", x0: xValue, x1: xValue, y0: 0, y1: 1,
                xref: "x", yref: "paper",
                line: { color: "red", width: 1, dash: "dot" }
            }],
            annotations: [{
                x: xValue, y: 1, xref: "x", yref: "y domain",
                text: ` x:${xValue.toFixed(6)}<br> y:${yValue.toFixed(4)} `,
                showarrow: false, yanchor: "bottom",
                bgcolor: "rgba(255,255,255,0.85)", bordercolor: "red", borderwidth: 1,
                font: { size: 9 }, align: "left"
            }]
        });
    });
    return Promise.all(updates);
}

function updateCursorStatus(x, y) {
    const el = document.getElementById("statusCursor");
    if (!el) return;
    if (x === null) {
        el.textContent = "光标: —";
    } else {
        el.textContent = `光标: t=${x.toFixed(6)}s  y=${y ? y.toFixed(4) : '—'}`;
    }
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
                if (isCursorModeEnabled && globalCursorX !== null) {
                    applyGlobalCursorLine(globalCursorX);
                }
            }
        }, 250);
    });
});
