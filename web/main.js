// # ===== frontend/main.js =====    这个js文件主要控制输出波形图
// 前端主逻辑：负责上传文件、显示元信息、管理通道选择、绘制多通道波形图、
// 以及支持 Plotly 子图间联动缩放和移动端侧边栏交互。

let originalXRange = null;  // 保存初始 X 轴范围，用于重置缩放
const allDivs = [];  // 收集所有子图 div
let isSyncing = false; // ✅ 全局唯一声明
let currentWaveform = null;     // 当前波形数据
let selectedChannels = [];      // 用户勾选的通道

let visibleCount = 5;   // 当前视口希望看到的子图数量（3 / 4 / 5）

let globalCursorX = null;        // 当前参考线 X
let isCursorModeEnabled = false; // 是否启用参考线模式

let pendingRelayout = null;     //节流变量



function getPlotHeight() {     //工具函数 控制子图高度
    const plots = document.getElementById("plots");
    if (!plots) return 200;

    const h = plots.clientHeight;
    return Math.floor(h / visibleCount);
}

function togglePageSizeMenu() {
    document.getElementById("pageSizeMenu").classList.toggle("hidden");
}

function setVisibleCount(count) {
    visibleCount = count;

    const btn = document.getElementById("pageSizeBtn");
    if (btn) {
        btn.textContent = `每页 ${count} 个 ▾`;
    }

    // 重新渲染
    renderPlots();

    // 收起下拉菜单
    document.getElementById("pageSizeMenu").classList.add("hidden");
}


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
    originalXRange = null; // ←  这个问题添加不知道是否又问题

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

    // debounce 防抖变量
    let relayoutTimer = null;
    const RELAYOUT_DEBOUNCE_MS = 60; // 40~80 都可以


    // ===== 新增：子图外层容器（用于顶部数据条）=====
    const wrapper = document.createElement("div");
    container.appendChild(wrapper);


    // ===== 原有 Plotly 子图容器 =====
    const div = document.createElement("div");
    wrapper.appendChild(div);

    // ⚠️ 注意：allDivs 仍然只收集 Plotly div
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
        // height: isDigital ? 120 : 200,   // 数字通道更矮一点
        height: getPlotHeight(),
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
            title: null,           // 【修改】移除单位标题
            showticklabels: false, // 【修改】移除刻度文字
            ticks: "",             // 【修改】移除刻度线
            range: originalXRange.slice()
        },

        showlegend: false
    };

    Plotly.newPlot(div, [trace], layout, {
        responsive: true,
        displayModeBar: false,
        doubleClick: false   //不处理双颊重置   不知道用不用添加
    });

    // 缩放联动
    div.on('plotly_relayout', (eventData) => {
        if (isSyncing) return;

        // === 新增：防抖 ===
        if (relayoutTimer) {
            clearTimeout(relayoutTimer);
        }

        relayoutTimer = setTimeout(() => {
            const update = {};

            // === X 轴联动 ===
            if ('xaxis.range[0]' in eventData && 'xaxis.range[1]' in eventData) {
                update['xaxis.range'] = [
                    eventData['xaxis.range[0]'],
                    eventData['xaxis.range[1]']
                ];
            }

            // === Y 轴联动 ===
            if ('yaxis.range[0]' in eventData && 'yaxis.range[1]' in eventData) {
                update['yaxis.range'] = [
                    eventData['yaxis.range[0]'],
                    eventData['yaxis.range[1]']
                ];
            }

            if (Object.keys(update).length === 0) return;

            isSyncing = true;
            allDivs.forEach((d) => {
                if (d !== div) {
                    Plotly.relayout(d, update);
                }
            });
            isSyncing = false;
        }, RELAYOUT_DEBOUNCE_MS);
        });

    // ===== 新增：参考线点击事件 =====
    div.on("plotly_click", (event) => { 
        if (!isCursorModeEnabled) return;
        if (!event.points || !event.points.length) return;

        const xValue = event.points[0].x;
        globalCursorX = xValue;

        applyGlobalCursorLine(xValue);
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

    // ===== 关键修复：恢复参考线 =====
  if (isCursorModeEnabled && globalCursorX !== null) {
    applyGlobalCursorLine(globalCursorX);
  }
}


// 横屏手机判断
function isLandscapeMobile() {
  return window.matchMedia(
    "(max-width: 900px) and (orientation: landscape)"
  ).matches;
}

// 桌面端侧栏
function toggleSidebarDesktop() {
  const sidebar = document.getElementById("sidebar");
  sidebar.classList.toggle("active");
}

// 移动端（横屏）侧栏
function toggleSidebarMobile(forceClose = false) {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");

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

// 统一入口（唯一）
function toggleSidebar() {
  if (isLandscapeMobile()) {
    toggleSidebarMobile();
  } else {
    toggleSidebarDesktop();
  }
}

// 事件绑定
document.addEventListener("DOMContentLoaded", () => {
  const toggleBtn = document.getElementById("toggleSidebar");
  const overlay = document.getElementById("sidebarOverlay");

  if (toggleBtn) {
    toggleBtn.addEventListener("click", toggleSidebar);
  }

  if (overlay) {
    overlay.addEventListener("click", () => {
      toggleSidebarMobile(true);
    });
  }

  // 横竖屏切换时，强制关闭移动端侧栏
  window.addEventListener("orientationchange", () => {
    setTimeout(() => {
      toggleSidebarMobile(true);
    }, 200);
  });

   /* 二、新增：子图显示数量选择逻辑 */
  const pageSizeBtn = document.getElementById("pageSizeBtn");
  const pageSizeMenu = document.getElementById("pageSizeMenu");

  if (pageSizeBtn && pageSizeMenu) {

    // 点击 li（3 / 4 / 5）
    pageSizeMenu.querySelectorAll("li").forEach(li => {
      li.addEventListener("click", () => {
        const size = Number(li.dataset.size); // ← data-size 的真正用途
        setVisibleCount(size);

        pageSizeMenu.classList.add("hidden"); // 选完自动收起
      });
    });

    // 点击页面其他地方，自动收起菜单
    document.addEventListener("click", (e) => {
      if (!pageSizeBtn.contains(e.target) &&
          !pageSizeMenu.contains(e.target)) {
        pageSizeMenu.classList.add("hidden");
      }
    });
  }
});

// 参考线js逻辑
function toggleCursorMode() {
  isCursorModeEnabled = !isCursorModeEnabled;

  const btn = document.getElementById("cursorToggleBtn");
  if (!btn) return;

  if (isCursorModeEnabled) {
    btn.textContent = "参考线：开";
    btn.classList.add("active");
  } else {
    btn.textContent = "参考线：关";
    btn.classList.remove("active");

    // 可选：关闭时清除参考线
    globalCursorX = null;
    allDivs.forEach(div => {
      Plotly.relayout(div, { shapes: [] });
    });
  }
}


// 参考线绘制函数
function applyGlobalCursorLine(xValue) {

    allDivs.forEach((div) => {

        const trace = div.data[0];
        const time = trace.x;
        const values = trace.y;

        const yValue = getYValueAtX(time, values, xValue);

        // ===== 参考线（始终 1 条）=====
        const lineShape = {
            type: "line",
            x0: xValue,
            x1: xValue,
            y0: 0,
            y1: 1,
            xref: "x",
            yref: "paper",
            line: {
                color: "red",
                width: 1,
                dash: "dot"
            }
        };

        // ===== 悬浮数值标注（贴近交点）=====
        const annotation = {
            x: xValue,
            y: yValue,
            xref: "x",
            yref: "y",
            text: `x=${xValue.toFixed(6)}<br>y=${yValue.toFixed(6)}`,
            showarrow: true,
            arrowhead: 2,
            ax: 12,     // 轻微右移，避免遮挡参考线
            ay: -12,    // 轻微上移
            bgcolor: "rgba(255,255,255,0.85)",
            bordercolor: "red",
            borderwidth: 1,
            font: { size: 10 },
            align: "left"
        };

        // ===== 核心：始终整体替换，但数量恒定 =====
        Plotly.relayout(div, {
            shapes: [lineShape],
            annotations: [annotation]
        });
    });
}




// 参考线 更具x查y数值的工具函数
// 后续功能可以再调整
function getYValueAtX(timeArray, valueArray, x) {
    let idx = 0;
    let minDiff = Infinity;

    for (let i = 0; i < timeArray.length; i++) {
        const diff = Math.abs(timeArray[i] - x);
        if (diff < minDiff) {
            minDiff = diff;
            idx = i;
        }
    }
    return valueArray[idx];
}





