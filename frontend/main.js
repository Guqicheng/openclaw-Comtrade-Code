// # ===== frontend/main.js =====    这个js文件主要控制输出波形图

let originalXRange = null;
const allDivs = [];  // 收集所有子图 div
let isSyncing = false; // ✅ 全局唯一声明

let currentWaveform = null;   // 保存当前数据
let selectedChannels = [];    // 保存选中通道

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

    const res = await fetch("/upload", {
        method: "POST",
        body: formData
    });

    const data = await res.json();
    if (data.error) {
        alert("错误: " + data.error);
        return;
    }

    displayMetadata(data.metadata);
    plotWaveforms(data.waveform);
}

function displayMetadata(meta) {
    const el = document.getElementById("metadata");
    el.innerHTML = `<h3>元信息</h3>
        <p>变电站名称: ${meta.stationName}</p>
        <p>设备ID: ${meta.recDevId}</p>
        <p>版本: ${meta.revYear}</p>

        <p>总通道数: ${meta.totalChannels}</p>
        <p>模拟通道数: ${meta.analogChannels}</p>
        <p>数字通道数: ${meta.digitalChannels}</p>

        <p>频率: ${meta.frequency} Hz</p>

        <p>采样数量: ${meta.nrates}</p>
        <p>采样率：${meta.samplingRates}</p>

        <p>开始时间: ${meta.startTime}</p>
        <p>触发时间: ${meta.triggerTime}</p>
        <p>文件格式: ${meta.fileFormat}</p>
        <p>时间倍增: ${meta.timeMultiplier}</p>
        
        <p>总采样点数: ${meta.total_samples}</p>`;
}

function plotWaveforms(waveform) {
    currentWaveform = waveform; // ✅ 保存全局数据

    // 初始化选择通道（默认全选）
    selectedChannels = Object.keys(waveform.analog);

    // 渲染选择器
    const channelList = document.getElementById("channelList");
    channelList.innerHTML = "";
    selectedChannels.forEach(channelName => {
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = channelName;
        checkbox.checked = true;
        checkbox.onchange = (e) => {
            if (e.target.checked) {
                if (!selectedChannels.includes(channelName)) {
                    selectedChannels.push(channelName);
                }
            } else {
                selectedChannels = selectedChannels.filter(c => c !== channelName);
            }
        };

        const label = document.createElement("label");
        label.style.display = "block";
        label.textContent = channelName;
        label.prepend(checkbox);
        channelList.appendChild(label);
    });

    renderPlots();
}

function renderPlots() {
    const container = document.getElementById("plots");
    container.innerHTML = "";
    allDivs.length = 0;

    if (!currentWaveform) return;

    const time = currentWaveform.time;
    if (!originalXRange) {
        originalXRange = [Math.min(...time), Math.max(...time)];
    }

    selectedChannels.forEach(channelName => {
        const values = currentWaveform.analog[channelName];
        const div = document.createElement("div");
        div.style.marginBottom = "6px";
        container.appendChild(div);
        allDivs.push(div);

        // ✅ 根据字数调整字体大小
        const maxFontSize = 16;
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
            line: { width: 1 },
            name: channelName
        };

        const layout = {
            height: 200,
            margin: { l: 100, r: 20, t: 20, b: 30 },
            yaxis: {
                title: { 
                    text: channelName, 
                    standoff: 10,
                    font: { size: dynamicFontSize }
                }
            },
            xaxis: {
                title: "时间（秒）",
                range: originalXRange.slice()
            },
            showlegend: false
        };

        Plotly.newPlot(div, [trace], layout, {
            responsive: true,
            displayModeBar: false
        });

        // 绑定联动缩放
        div.on('plotly_relayout', (eventData) => {
            if (isSyncing) return;

            if ('xaxis.range[0]' in eventData && 'xaxis.range[1]' in eventData) {
                const range0 = eventData['xaxis.range[0]'];
                const range1 = eventData['xaxis.range[1]'];

                const update = { 'xaxis.range': [range0, range1] };

                isSyncing = true;
                allDivs.forEach((d) => {
                    if (d !== div) {
                        Plotly.relayout(d, update);
                    }
                });
                isSyncing = false;
            }
        });
    });
}

// ✅ 全选/全不选功能
function selectAllChannels(selectAll) {
    const checkboxes = document.querySelectorAll("#channelList input[type=checkbox]");
    checkboxes.forEach(cb => cb.checked = selectAll);
    selectedChannels = selectAll ? Object.keys(currentWaveform.analog) : [];
}

// ✅ 应用选择
function applySelection() {
    renderPlots();
}

// ✅ 重置缩放：让 Plotly 走和双击一样的逻辑
function resetZoom() {
    if (!allDivs.length) return;
    isSyncing = true;
    allDivs.forEach((div) => {
        Plotly.relayout(div, {
            'xaxis.autorange': true,
            'yaxis.autorange': true
        });
    });
    isSyncing = false;
}
