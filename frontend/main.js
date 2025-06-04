// # ===== frontend/main.js =====    这个js文件主要控制输出波形图

let originalXRange = null;
const allDivs = [];  // 收集所有子图 div
let isSyncing = false;

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
    const container = document.getElementById("plots");
    container.innerHTML = "";
    const time = waveform.time;
    
    

    
    Object.entries(waveform.analog).forEach(([channelName, values]) => {
        const div = document.createElement("div");
        div.style.marginBottom = "6px";  // ✅ 控制波形之间的间距
        container.appendChild(div);
        allDivs.push(div);

        const trace = {
            x: time,
            y: values,
            mode: 'lines',
            line: { width: 1 },
            name: channelName
        };

        const layout = {
            height: 200,  // ✅ 控制单个波形高度
            margin: {
                l: 100,  // ✅ 左边间距，给 y 轴标题留空间
                r: 20,t: 20,b: 30
            },
            yaxis: {
                title: {
                    text: channelName,  // ✅ 把通道名放在左边 y 轴
                    standoff: 10
                }
            },
            xaxis: {
                title: "时间（秒）",
                range: originalXRange  // ✅ 设置初始范围
            },
            showlegend: false  // ✅ 不要图例
        };

        // Plotly.newPlot(div, [trace], layout, { responsive: true, displayModeBar: false }).then(() => {
        //     // 只记录第一个图的初始范围
        //     if (originalXRange === null && time.length > 1) {
        //         originalXRange = [time[0], time[time.length - 1]];
        //     }
        // });
        Plotly.newPlot(div, [trace], layout, {
            responsive: true,
            displayModeBar: false
        });



         // 为第一个图添加事件监听
        // ✅ 给每一个图都绑定 relayout 事件监听
        div.on('plotly_relayout', (eventData) => {
            if (isSyncing) return;

            const range0 = eventData['xaxis.range[0]'];
            const range1 = eventData['xaxis.range[1]'];

            if (range0 !== undefined && range1 !== undefined) {
                const update = { 'xaxis.range': [range0, range1] };
                isSyncing = true;
                allDivs.forEach((d) => {
                    if (d !== div) {
                        Plotly.relayout(d, update);
                    }
                });
                isSyncing = false;

                // ✅ 更新原始范围（用于 resetZoom）
                originalXRange = [range0, range1];
            }
        });


    });
}

function resetZoom() {
  if (!originalXRange) return;

  const update = {
    'xaxis.range': originalXRange
  };

  const plots = document.getElementById("plots").children;
  for (let i = 0; i < plots.length; i++) {
    Plotly.relayout(plots[i], update);
  }
}
