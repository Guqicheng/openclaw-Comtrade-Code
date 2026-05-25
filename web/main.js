// # ===== frontend/main.js =====
// 前端主逻辑：上传/波形绘制/缩放联动/侧边栏/状态栏

let originalXRange = null;
const allDivs = [];
let isSyncing = false;
let currentWaveform = null;
let currentAnalysisId = null;
let selectedChannels = [];

let visibleCount = 5;

let pendingRelayout = null;
let plotCreationCounter = { total: 0, completed: 0 };


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

    if (!data.analysisId) {
        alert("错误: 服务端未返回 analysisId");
        setStatus("解析失败");
        return;
    }

    currentAnalysisId = data.analysisId;
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
        showlegend: false
    };

    Plotly.newPlot(div, [trace], layout, {
        responsive: true,
        displayModeBar: false,
        doubleClick: false
    }).then(() => {
        let _rightClickZoom = false;

        div.on('plotly_relayout', (eventData) => {
            if (eventData['shapes'] !== undefined || eventData['annotations'] !== undefined) return;
            if (isSyncing) return;
            if (_rightClickZoom) {
                _rightClickZoom = false;
                if (originalXRange && eventData['xaxis.range[0]'] !== undefined) {
                    Plotly.relayout(div, { 'xaxis.range': originalXRange.slice() });
                }
                return;
            }
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
                });
            }, RELAYOUT_DEBOUNCE_MS);
        });

        div.on("plotly_click", (event) => {
            if (!event.points || !event.points.length) return;
            if (typeof isDualCursorMode !== 'undefined' && isDualCursorMode) {
                handleDualCursorClick(event, 'C1');
            }
        });

        div.addEventListener("mousedown", (e) => {
            if (e.button === 2 && isDualCursorMode) { _rightClickZoom = true; }
        });
        div.addEventListener("contextmenu", (e) => {
            if (!isDualCursorMode) return;
            e.preventDefault();
            e.stopPropagation();
            _rightClickZoom = false;
            const fullLayout = div._fullLayout;
            if (!fullLayout || !fullLayout.xaxis) return;
            const xaxis = fullLayout.xaxis;
            const rect = div.getBoundingClientRect();
            const axisOffset = xaxis._offset || 0;
            const axisLen = xaxis._length || 1;
            const rng = xaxis.range || xaxis._range || [0,1];
            const ratio = (e.clientX - rect.left - axisOffset) / axisLen;
            const xVal = rng[0] + ratio * (rng[1] - rng[0]);
            const trace = div.data && div.data[0];
            if (trace && trace.x) {
                const time = trace.x;
                let nearestIdx = 0, minDiff = Infinity;
                for (let i = 0; i < time.length; i++) {
                    const diff = Math.abs(time[i] - xVal);
                    if (diff < minDiff) { minDiff = diff; nearestIdx = i; }
                }
                handleDualCursorClick({ points: [{ x: time[nearestIdx], y: trace.y[nearestIdx] }] }, 'C2');
            }
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
    });
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
            }
        }, 250);
    });
});
