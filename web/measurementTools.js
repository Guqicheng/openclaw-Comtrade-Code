// # ===== web/measurementTools.js =====
// 测量与分析工具：双光标、RMS计算、峰值检测、FFT谐波分析
// 依赖 main.js：allDivs, currentWaveform, currentAnalysisId, getYValueAtX

function withAnalysisId(payload) {
    if (!currentAnalysisId) {
        throw new Error("请先上传并解析 COMTRADE 文件");
    }
    return { analysisId: currentAnalysisId, ...payload };
}

// ===================== 双光标测量 =====================
let isDualCursorMode = false;
let cursor1 = null;
let cursor2 = null;

function toggleDualCursorMode() {
    isDualCursorMode = !isDualCursorMode;
    const btn = document.getElementById("dualCursorBtn");
    if (!btn) return;
    btn.classList.toggle("active");

    if (isDualCursorMode) {
        cursor1 = null; cursor2 = null;
        showFloatingResults("双光标", '<span class="measure-hint">左键放 C1，右键放 C2</span>');
        allDivs.forEach(div => { try { Plotly.relayout(div, { dragmode: false }); } catch(e) {} });
    } else {
        clearDualCursors();
        closeFloatingResults();
        if (typeof applyWaveDragmodeToAllPlots === "function") {
            applyWaveDragmodeToAllPlots();
        } else {
            allDivs.forEach(div => { try { Plotly.relayout(div, { dragmode: "zoom" }); } catch(e) {} });
        }
    }
}

function clearDualCursors() {
    cursor1 = null;
    cursor2 = null;
    if (typeof refreshPlotOverlays === "function") {
        refreshPlotOverlays();
        return;
    }
    allDivs.forEach(div => {
        if (div && div.layout) Plotly.relayout(div, { shapes: [], annotations: [] });
    });
}

/** 供 main.js refreshPlotOverlays 合并绘制，避免与触发点互相覆盖 */
function buildDualCursorOverlaysForDiv(div) {
    const shapes = [];
    const annotations = [];
    if (!cursor1 && !cursor2) return { shapes, annotations };
    if (!div || !div.data || !div.data.length) return { shapes, annotations };

    const trace = div.data[0];
    const time = trace.x;
    const values = trace.y;
    if (!time || !values) return { shapes, annotations };

    if (cursor1) {
        const y1 = getYValueAtX(time, values, cursor1.x);
        shapes.push({
            type: "line",
            x0: cursor1.x,
            x1: cursor1.x,
            y0: 0,
            y1: 1,
            xref: "x",
            yref: "paper",
            line: { color: "#e74c3c", width: 1.5 },
        });
        annotations.push({
            x: cursor1.x,
            y: 1,
            xref: "x",
            yref: "y domain",
            text: `C1 t:${cursor1.x.toFixed(4)}s<br>y:${y1.toFixed(4)}`,
            showarrow: false,
            yanchor: "bottom",
            bgcolor: "rgba(231,76,60,0.85)",
            bordercolor: "#e74c3c",
            borderwidth: 1,
            font: { size: 9, color: "white" },
            align: "left",
        });
    }
    if (cursor2) {
        const y2 = getYValueAtX(time, values, cursor2.x);
        shapes.push({
            type: "line",
            x0: cursor2.x,
            x1: cursor2.x,
            y0: 0,
            y1: 1,
            xref: "x",
            yref: "paper",
            line: { color: "#2980b9", width: 1.5 },
        });
        annotations.push({
            x: cursor2.x,
            y: 1,
            xref: "x",
            yref: "y domain",
            text: `C2 t:${cursor2.x.toFixed(4)}s<br>y:${y2.toFixed(4)}`,
            showarrow: false,
            yanchor: "bottom",
            bgcolor: "rgba(41,128,185,0.85)",
            bordercolor: "#2980b9",
            borderwidth: 1,
            font: { size: 9, color: "white" },
            align: "left",
        });
    }
    return { shapes, annotations };
}

function handleDualCursorClick(event, cursorType) {
    if (!isDualCursorMode) return;
    if (!event.points || !event.points.length) return;

    const xValue = event.points[0].x;
    const yValue = event.points[0].y;

    if (cursorType === 'C1') {
        cursor1 = { x: xValue, y: yValue };
    } else {
        cursor2 = { x: xValue, y: yValue };
    }

    if (cursor1 && cursor2) {
        updateDualCursorDisplay();
    } else {
        const hint = cursor1 ? 'C1 已放置，右键放 C2' : 'C2 已放置，左键放 C1';
        showFloatingResults("双光标", `<span class="measure-hint">${hint}</span>`);
    }
    drawDualCursors();
}

function drawDualCursors() {
    if (typeof refreshPlotOverlays === "function") {
        refreshPlotOverlays();
        return;
    }
    allDivs.forEach(div => {
        const dual = buildDualCursorOverlaysForDiv(div);
        Plotly.relayout(div, { shapes: dual.shapes, annotations: dual.annotations });
    });
}

function updateDualCursorDisplay() {
    if (!cursor1 || !cursor2) return;
    const dt = cursor2.x - cursor1.x;
    // 从第一个子图的实际数据获取 y（保证与标注框一致）
    let y1 = cursor1.y, y2 = cursor2.y;
    const first = allDivs.find(d => d && d.data && d.data[0]);
    if (first) {
        const t = first.data[0].x, v = first.data[0].y;
        y1 = getYValueAtX(t, v, cursor1.x);
        y2 = getYValueAtX(t, v, cursor2.x);
    }
    const dy = y2 - y1;
    const freq = dt !== 0 ? Math.abs(1.0 / dt) : 0;

    const html = `
        <table class="measure-table">
            <tr><td>C1 时间</td><td>${cursor1.x.toFixed(6)} s</td></tr>
            <tr><td>C2 时间</td><td>${cursor2.x.toFixed(6)} s</td></tr>
            <tr><td>Δt</td><td><strong>${Math.abs(dt).toFixed(6)} s</strong></td></tr>
            <tr><td>Δy</td><td><strong>${dy.toFixed(4)}</strong></td></tr>
            <tr><td>计算频率</td><td><strong>${freq.toFixed(2)} Hz</strong></td></tr>
        </table>
        <button onclick="clearDualCursors(); showFloatingResults('双光标','<span class=\\'measure-hint\\'>点击波形放置光标 C1</span>');" class="measure-btn-small">重置</button>
    `;
    showFloatingResults("双光标", html);
}


// ===================== 浮动结果面板 =====================
function showFloatingResults(title, content) {
    const panel = document.getElementById("floatingResults");
    const titleEl = document.getElementById("floatingTitle");
    const body = document.getElementById("floatingBody");
    if (!panel || !titleEl || !body) return;
    titleEl.textContent = title;
    body.innerHTML = content;
    panel.classList.add("visible");
}

function closeFloatingResults() {
    const panel = document.getElementById("floatingResults");
    if (panel) panel.classList.remove("visible");
}


// ===================== RMS 计算 =====================
async function calculateChannelRMS(channelName) {
    showFloatingResults("RMS 计算", '<span class="measure-hint">计算中...</span>');
    try {
        const res = await fetch("/analysis/rms", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(withAnalysisId({ channelName, cycleFreq: 50 }))
        });
        const data = await res.json();
        if (data.error) {
            showFloatingResults("RMS 计算", `<span class="measure-error">${data.error}</span>`);
            return;
        }

        let perCycleStats = '';
        if (data.perCycle && data.perCycle.length > 0) {
            const minRms = Math.min(...data.perCycle);
            const maxRms = Math.max(...data.perCycle);
            const avgRms = data.perCycle.reduce((a, b) => a + b, 0) / data.perCycle.length;
            perCycleStats = `
                <tr><td>每周波 RMS 范围</td><td>${minRms.toFixed(4)} ~ ${maxRms.toFixed(4)}</td></tr>
                <tr><td>每周波 RMS 均值</td><td>${avgRms.toFixed(4)}</td></tr>
                <tr><td>周波数</td><td>${data.perCycle.length}</td></tr>
            `;
        }

        showFloatingResults(`RMS - ${channelName}`, `
            <table class="measure-table">
                <tr><td>全波 RMS</td><td><strong>${data.overall}</strong></td></tr>
                ${perCycleStats}
            </table>
        `);
    } catch (e) {
        showFloatingResults("RMS 计算", `<span class="measure-error">请求失败: ${e.message}</span>`);
    }
}


// ===================== 峰值检测 =====================
async function detectChannelPeaks(channelName) {
    showFloatingResults("峰谷检测", '<span class="measure-hint">检测中...</span>');
    try {
        const res = await fetch("/analysis/peaks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(withAnalysisId({ channelName, thresholdRatio: 0.1 }))
        });
        const data = await res.json();
        if (data.error) {
            showFloatingResults("峰谷检测", `<span class="measure-error">${data.error}</span>`);
            return;
        }

        let peakList = '';
        if (data.peaks && data.peaks.length > 0) {
            peakList = '<tr><th>时间 (s)</th><th>幅值</th></tr>';
            data.peaks.slice(0, 15).forEach(p => {
                peakList += `<tr><td>${p.time.toFixed(4)}</td><td>${p.value.toFixed(4)}</td></tr>`;
            });
        }

        showFloatingResults(`峰谷 - ${channelName}`, `
            <table class="measure-table">
                <tr><td>波峰数</td><td>${data.peaks ? data.peaks.length : 0}</td></tr>
                <tr><td>波谷数</td><td>${data.valleys ? data.valleys.length : 0}</td></tr>
            </table>
            ${peakList ? '<table class="measure-table" style="margin-top:6px">' + peakList + '</table>' : ''}
        `);
    } catch (e) {
        showFloatingResults("峰谷检测", `<span class="measure-error">请求失败: ${e.message}</span>`);
    }
}


// ===================== FFT 谐波分析 =====================
async function performFFTAnalysis(channelName) {
    showFloatingResults("FFT 分析", '<span class="measure-hint">分析中...</span>');
    try {
        const res = await fetch("/analysis/fft", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(withAnalysisId({ channelName }))
        });
        const data = await res.json();
        if (data.error) {
            showFloatingResults("FFT 分析", `<span class="measure-error">${data.error}</span>`);
            return;
        }

        displayFFTModal(data);

        let harmonicHtml = `
            <table class="measure-table">
                <tr><td>基波频率</td><td><strong>${data.fundamentalFreq} Hz</strong></td></tr>
                <tr><td>THD</td><td><strong>${data.thd}%</strong></td></tr>
            </table>
            <table class="measure-table harmonics-table">
                <tr><th>谐波</th><th>频率</th><th>幅值</th><th>占比</th></tr>
        `;
        (data.harmonics || []).forEach(h => {
            harmonicHtml += `<tr class="${h.order === 1 ? 'fundamental-row' : ''}">
                <td>${h.order === 1 ? '基波' : h.order + '次'}</td>
                <td>${h.freq} Hz</td>
                <td>${h.mag}</td>
                <td>${h.percent}%</td>
            </tr>`;
        });
        harmonicHtml += '</table>';

        showFloatingResults(`FFT - ${channelName}`, harmonicHtml);
    } catch (e) {
        showFloatingResults("FFT 分析", `<span class="measure-error">请求失败: ${e.message}</span>`);
    }
}

function displayFFTModal(data) {
    const modal = document.getElementById("fftModal");
    const plotContainer = document.getElementById("fftPlot");
    const harmContainer = document.getElementById("fftHarmonics");
    if (!modal || !plotContainer) return;

    modal.style.display = "flex";

    const maxFreq = data.maxFreq > 0 ? data.maxFreq : 2000;
    const freqData = [];
    const magData = [];
    for (let i = 0; i < data.frequencies.length; i++) {
        if (data.frequencies[i] <= maxFreq) {
            freqData.push(data.frequencies[i]);
            magData.push(data.magnitudes[i]);
        }
    }

    const trace = {
        x: freqData, y: magData, type: 'bar',
        marker: { color: '#409eff', line: { color: '#2c7be5', width: 0.5 } },
        name: '频谱'
    };

    const layout = {
        title: `基波 ${data.fundamentalFreq} Hz · THD = ${data.thd}%`,
        xaxis: { title: '频率 (Hz)', range: [0, maxFreq] },
        yaxis: { title: '幅值' },
        height: 280,
        margin: { l: 50, r: 15, t: 35, b: 45 },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)'
    };
    Plotly.newPlot(plotContainer, [trace], layout, { responsive: true, displayModeBar: false });

    // 谐波表
    if (harmContainer && data.harmonics) {
        let html = '<table class="measure-table harmonics-table" style="width:100%;margin-top:8px"><tr><th>谐波</th><th>频率</th><th>幅值</th><th>占比</th></tr>';
        data.harmonics.forEach(h => {
            html += `<tr class="${h.order === 1 ? 'fundamental-row' : ''}"><td>${h.order === 1 ? '基波' : h.order + '次'}</td><td>${h.freq} Hz</td><td>${h.mag}</td><td>${h.percent}%</td></tr>`;
        });
        html += '</table>';
        harmContainer.innerHTML = html;
    }
}

function closeFFTModal() {
    const modal = document.getElementById("fftModal");
    if (modal) modal.style.display = "none";
    const plotContainer = document.getElementById("fftPlot");
    if (plotContainer) Plotly.purge(plotContainer);
    const harmContainer = document.getElementById("fftHarmonics");
    if (harmContainer) harmContainer.innerHTML = '';
}


// ===================== 相角差计算 =====================
async function calculatePhaseDiff(channelA, channelB) {
    showFloatingResults("相角差", '<span class="measure-hint">计算中...</span>');
    try {
        const res = await fetch("/analysis/phase-diff", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(withAnalysisId({ channelA, channelB }))
        });
        const data = await res.json();
        if (data.error) {
            showFloatingResults("相角差", `<span class="measure-error">${data.error}</span>`);
            return;
        }
        showFloatingResults("相角差", `
            <table class="measure-table">
                <tr><td>通道A</td><td>${channelA}</td></tr>
                <tr><td>通道B</td><td>${channelB}</td></tr>
                <tr><td style="font-size:13px;font-weight:bold">相角差</td><td style="font-size:13px;font-weight:bold;color:#2980b9">${data.phaseDiffDeg}°</td></tr>
            </table>
        `);
    } catch (e) {
        showFloatingResults("相角差", `<span class="measure-error">请求失败: ${e.message}</span>`);
    }
}


// ===================== 通道选择器联动 =====================
function getAnalogChannelNames() {
    if (!currentWaveform) return [];
    return Object.keys(currentWaveform.analog || {});
}

function populateAnalysisChannelSelectors() {
    const channels = getAnalogChannelNames();
    const selectors = ["rmsChannelSelect", "peakChannelSelect", "fftChannelSelect",
                       "phaseDiffChannelA", "phaseDiffChannelB"];

    selectors.forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        sel.innerHTML = channels.map(ch => `<option value="${ch}">${ch}</option>`).join('');
    });
}


// ===================== 事件绑定 =====================
document.addEventListener("DOMContentLoaded", () => {
    const dualBtn = document.getElementById("dualCursorBtn");
    if (dualBtn) dualBtn.addEventListener("click", toggleDualCursorMode);

    // 浮动面板关闭
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeFloatingResults();
    });

    // FFT 模态框关闭
    const closeBtn = document.getElementById("fftModalClose");
    if (closeBtn) closeBtn.addEventListener("click", closeFFTModal);
    const modal = document.getElementById("fftModal");
    if (modal) modal.addEventListener("click", (e) => { if (e.target === modal) closeFFTModal(); });
});
