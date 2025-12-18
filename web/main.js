// # ===== frontend/main.js =====    这个js文件主要控制输出波形图
// 前端主逻辑：负责上传文件、显示元信息、管理通道选择、绘制多通道波形图、
// 以及支持 Plotly 子图间联动缩放和移动端侧边栏交互。

let originalXRange = null;  // 保存初始 X 轴范围，用于重置缩放
const allDivs = [];  // 收集所有子图 div
let isSyncing = false; // ✅ 全局唯一声明
let currentWaveform = null;     // 当前波形数据
let selectedChannels = [];      // 用户勾选的通道


async function uploadFiles() {      // 上传 cfg/dat、调用后端解析并初始化页面
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

    displayMetadata(data.metadata);     // 展示元信息
    currentWaveform = data.waveform;    // 保存波形


    // ✅ 初始化通道选择（只调用一次 populate，不要覆盖 applySelectedChannels 的逻辑）
    if (typeof populateChannelList === "function") {
        // populateChannelList(data.waveform);     // 初始化通道选择列表
        populateChannelList(currentWaveform);
    }

    // ✅ 默认绘制全部波形
    selectedChannels = Object.keys(currentWaveform.analog);     // 默认全选
    renderPlots();
}           

function displayMetadata(meta) {        // 渲染解析后的 COMTRADE 元信息
    const el = document.getElementById("metadata");
    el.innerHTML = `
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


function renderPlots() {        // 根据所选通道绘制多子图，并支持缩放联动
    const container = document.getElementById("plots");
    container.innerHTML = "";
    allDivs.length = 0;

    if (!currentWaveform || !selectedChannels.length) return;

    const time = currentWaveform.time;
    if (!originalXRange) {          // 初始化原始 X 范围用于复位缩放
        originalXRange = [Math.min(...time), Math.max(...time)];
    }


    // === 1) 显示模拟通道 analog ===
    Object.keys(currentWaveform.analog).forEach(channelName => {
        if (!selectedChannels.includes(channelName)) return;

        createPlotDiv(container, time, currentWaveform.analog[channelName], channelName);
    });

    // === 2) 显示数字通道 digital ===
    Object.keys(currentWaveform.digital || {}).forEach(channelName => {
        if (!selectedChannels.includes(channelName)) return;
        createPlotDiv(container, time, currentWaveform.digital[channelName], channelName, true);
    }); 

    
}

function createPlotDiv(container, time, values, channelName, isDigital = false) {
    const div = document.createElement("div");
    div.style.marginBottom = "6px";
    container.appendChild(div);
    allDivs.push(div);

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
        line: { width: isDigital ? 2 : 1, shape: isDigital ? "hv" : "linear" }, // 数字通道用阶梯图
        name: channelName
    };

    const layout = {
        height: isDigital ? 120 : 200,   // 数字通道更矮一点
        margin: { l: 100, r: 20, t: 20, b: 30 },
        yaxis: {
            title: {
                text: channelName,
                standoff: 10,
                font: { size: dynamicFontSize }
            },
            range: isDigital ? [-0.5, 1.5] : undefined  // 数字通道固定范围
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

    // 缩放联动
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
}


// 重置缩放：让 Plotly 走和双击一样的逻辑
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

// ========== 移动端侧边栏开关 ==========
function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  sidebar.classList.toggle("active");
}


// 折叠逻辑
document.addEventListener("DOMContentLoaded", () => {
  const sidebar = document.getElementById("sidebar");
  const toggleBtn = document.getElementById("toggleSidebar");
  const overlay = document.getElementById("sidebarOverlay");

  // 在横屏模式下才生效
  function isLandscapeMobile() {
    return window.matchMedia("(max-width: 900px) and (orientation: landscape)").matches;
  }

  function toggleSidebar(forceClose = false) {
    if (!isLandscapeMobile()) return; // 只在横屏手机上生效

    if (forceClose) {
      sidebar.classList.remove("open");
      overlay.style.display = "none";
      document.body.style.overflow = "";
      return;
    }

    const isOpen = sidebar.classList.toggle("open");
    overlay.style.display = isOpen ? "block" : "none";
    document.body.style.overflow = isOpen ? "hidden" : "";
  }

  if (toggleBtn && sidebar && overlay) {
    toggleBtn.addEventListener("click", () => toggleSidebar());
    overlay.addEventListener("click", () => toggleSidebar(true));
  }

  // 当横竖屏切换时自动关闭侧栏
  window.addEventListener("orientationchange", () => {
    setTimeout(() => toggleSidebar(true), 200);
  });
});

