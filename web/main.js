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

// let pendingRelayout = null;     //节流变量

// 在文件顶部的全局变量区域添加   
let pendingRelayout = null; // 全局防抖定时器

// ===== 新增：子图创建计数器 =====
let plotCreationCounter = { total: 0, completed: 0 };



function getPlotHeight() {     //工具函数 控制子图高度
    const plots = document.getElementById("plots");
    if (!plots) return 200;

    const h = plots.clientHeight;
    return Math.floor(h / visibleCount);
}

function togglePageSizeMenu() {
    document.getElementById("pageSizeMenu").classList.toggle("hidden");
}

function setVisibleCount(count) {  //分页函数
    if (count === visibleCount) return; // 相同值不处理 新添加

    visibleCount = count;

    const btn = document.getElementById("pageSizeBtn");
    if (btn) {
        btn.textContent = `每页 ${count} 个 ▾`;
    }

    // 添加过渡效果  新添加
    const plots = document.getElementById("plots");
    plots.style.transition = "height 0.3s ease";
    
    // 延迟渲染，确保过渡完成 新添加
    setTimeout(() => {
        renderPlots();
        plots.style.transition = "";
    }, 50);

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
    originalXRange = null;

    // ✅ 初始化通道选择（只调用一次 populate，不要覆盖 applySelectedChannels 的逻辑）
    if (typeof populateChannelList === "function") {
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

     // 清理现有的定时器
    if (pendingRelayout) {
        clearTimeout(pendingRelayout);
        pendingRelayout = null;
    }
    
    // 保存当前缩放状态（如果有）
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
    allDivs.length = 0;  // 清空数组

    if (!currentWaveform || !selectedChannels.length) return;

    const time = currentWaveform.time;
    if (!originalXRange) {
        originalXRange = [Math.min(...time), Math.max(...time)];
    }

    // ===== 修正：重置子图创建计数器 =====
    plotCreationCounter.total = 0;
    plotCreationCounter.completed = 0;
    
    // 计算需要创建的子图总数
    Object.keys(currentWaveform.analog).forEach(channelName => {
        if (selectedChannels.includes(channelName)) plotCreationCounter.total++;
    });
    Object.keys(currentWaveform.digital || {}).forEach(channelName => {
        if (selectedChannels.includes(channelName)) plotCreationCounter.total++;
    });

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

    // ===== 修正：使用回调机制确保所有子图创建完成 =====
    // 如果有缩放状态需要恢复，则设置一个等待所有子图创建完成的回调
    if (currentXRange) {
        window.restoreZoomAfterAllPlots = () => {
            // 恢复缩放状态
            allDivs.forEach(div => {
                if (div && div.layout) {
                    Plotly.relayout(div, {
                        'xaxis.range': currentXRange
                    });
                }
            });
            
            // 如果参考线模式开启，重新绘制
            if (isCursorModeEnabled && globalCursorX !== null) {
                setTimeout(() => {
                    applyGlobalCursorLine(globalCursorX);
                }, 50);
            }
        };
    }
}

// ===== 需要替换的函数：createPlotDiv =====
function createPlotDiv(container, time, values, channelName, isDigital = false) {
    const RELAYOUT_DEBOUNCE_MS = 60;

    // ===== 子图外层容器 =====
    const wrapper = document.createElement("div");
    container.appendChild(wrapper);

    // ===== Plotly 子图容器 =====
    const div = document.createElement("div");
    wrapper.appendChild(div);

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
        line: { width: isDigital ? 2 : 1, shape: isDigital ? "hv" : "linear" },
        name: channelName
    };

    const layout = {
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
            title: null,
            showticklabels: false,
            ticks: "",
            range: originalXRange.slice()
        },
        showlegend: false
    };

    // ===== 修正：使用Promise跟踪图表创建完成 =====
    Plotly.newPlot(div, [trace], layout, {
        responsive: true,
        displayModeBar: false,
        doubleClick: false
    }).then(() => {
        // 缩放联动事件绑定
        div.on('plotly_relayout', (eventData) => {
            // 如果是参考线更新触发的 relayout，跳过联动逻辑
            if (eventData['shapes'] !== undefined || eventData['annotations'] !== undefined) {
                return;
            }

            if (isSyncing) return;

            // 清除之前的防抖定时器
            if (pendingRelayout) {
                clearTimeout(pendingRelayout);
            }

            pendingRelayout = setTimeout(() => {
                const update = {};

                // === X 轴联动 ===
                if ('xaxis.range[0]' in eventData && 'xaxis.range[1]' in eventData) {
                    update['xaxis.range'] = [
                        eventData['xaxis.range[0]'],
                        eventData['xaxis.range[1]']
                    ];
                }

                // === Y 轴联动（仅限模拟通道）===
                if (!isDigital && 'yaxis.range[0]' in eventData && 'yaxis.range[1]' in eventData) {
                    update['yaxis.range'] = [
                        eventData['yaxis.range[0]'],
                        eventData['yaxis.range[1]']
                    ];
                }

                if (Object.keys(update).length === 0) return;

                isSyncing = true;

                // 批量更新所有子图
                const updates = allDivs.map(d => {
                    if (d !== div) {
                        return Plotly.relayout(d, update);
                    }
                    return Promise.resolve();
                });

                Promise.all(updates).then(() => {
                    isSyncing = false;
                    
                    // 如果参考线模式开启，重新绘制参考线
                    if (isCursorModeEnabled && globalCursorX !== null) {
                        requestAnimationFrame(() => {
                            applyGlobalCursorLine(globalCursorX);
                        });
                    }
                });
            }, RELAYOUT_DEBOUNCE_MS);
        });

        // 参考线点击事件
        div.on("plotly_click", (event) => { 
            if (!isCursorModeEnabled) return;
            if (!event.points || !event.points.length) return;

            const xValue = event.points[0].x;
            globalCursorX = xValue;
            applyGlobalCursorLine(xValue);
        });
        
        // ===== 重要：在图表完全创建后再添加到 allDivs =====
        allDivs.push(div);
        
        // ===== 更新计数器，检查是否所有子图都创建完成 =====
        plotCreationCounter.completed++;
        if (plotCreationCounter.completed === plotCreationCounter.total) {
            // 所有子图都创建完成，执行缩放恢复
            if (typeof window.restoreZoomAfterAllPlots === 'function') {
                setTimeout(() => {
                    window.restoreZoomAfterAllPlots();
                    // 清理回调函数
                    delete window.restoreZoomAfterAllPlots;
                }, 0);
            }
        }
    });
}

// ===== 需要替换的函数：resetZoom =====
function resetZoom() {
    if (!allDivs.length) return;

    isSyncing = true;

    allDivs.forEach((div) => {
        // ===== 修正：区分数字通道和模拟通道 =====
        const trace = div.data && div.data[0];
        const isDigital = trace && trace.line && trace.line.shape === 'hv';
        
        const update = {
            'xaxis.autorange': true
        };
        
        // 只有模拟通道重置 y 轴，数字通道保持固定范围
        if (!isDigital) {
            update['yaxis.autorange'] = true;
        } else {
            // 数字通道重置为固定范围 [-0.5, 1.5]
            update['yaxis.range'] = [-0.5, 1.5];
        }
        
        Plotly.relayout(div, update);
    });
    
    isSyncing = false;

    // ===== 关键修复：恢复参考线 =====
    if (isCursorModeEnabled && globalCursorX !== null) {
        // 使用setTimeout确保重置缩放完成后再绘制参考线
        setTimeout(() => {
            applyGlobalCursorLine(globalCursorX);
        }, 50);
    }
}

// ===== 需要替换的函数：toggleCursorMode =====
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

        // ===== 修正：同时清除参考线和标注 =====
        globalCursorX = null;
        
        // 批处理清除
        allDivs.forEach(div => {
            if (div && div.layout) {
                Plotly.relayout(div, { 
                    shapes: [],
                    annotations: []  // 新增：清除标注
                });
            }
        });
    }
}

// ===== 需要替换的函数：applyGlobalCursorLine =====
function applyGlobalCursorLine(xValue) {
    // 批量更新，减少重绘次数
    const updates = allDivs.map((div) => {
        // ===== 修正：添加安全检查 =====
        if (!div || !div.data || !div.data[0]) {
            console.warn('参考线绘制：子图数据未就绪', div);
            return Promise.resolve();
        }

        const trace = div.data[0];
        const time = trace.x;
        const values = trace.y;

        const yValue = getYValueAtX(time, values, xValue);

        // 参考线
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

        // 悬浮数值标注
        const annotation = {
            x: xValue,
            y: yValue,
            xref: "x",
            yref: "y",
            text: `x=${xValue.toFixed(6)}<br>y=${yValue.toFixed(6)}`,
            showarrow: true,
            arrowhead: 2,
            ax: 12,
            ay: -12,
            bgcolor: "rgba(255,255,255,0.85)",
            bordercolor: "red",
            borderwidth: 1,
            font: { size: 10 },
            align: "left"
        };

        return Plotly.relayout(div, {
            shapes: [lineShape],
            annotations: [annotation]
        });
    });

    // 等待所有更新完成
    return Promise.all(updates);
}

// ===== 需要替换的函数：stabilizeLayout =====
function stabilizeLayout() {
    if (allDivs.length === 0) return;
    
    const height = getPlotHeight();
    
    // 批处理更新，减少重绘次数
    const updates = allDivs.map(div => {
        // ===== 修正：添加安全检查 =====
        if (!div || !div.layout) {
            return Promise.resolve();
        }
        return Plotly.relayout(div, {
            height: height
        });
    });
    
    return Promise.all(updates);
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

// 参考线 更具x查y数值的工具函数
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
    pageSizeMenu.querySelectorAll("li").forEach(li => {
      li.addEventListener("click", () => {
        const size = Number(li.dataset.size);
        setVisibleCount(size);
        pageSizeMenu.classList.add("hidden");
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

  // 窗口调整大小事件
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