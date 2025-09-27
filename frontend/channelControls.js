// # ===== channelControls.js =====
// 专门处理通道选择、搜索、全选/全不选/应用选择

window.currentWaveform;
   // 保存当前完整波形数据
window.selectedChannels    // 保存用户选择的通道

// 初始化通道列表
function populateChannelList(waveform) {
    currentWaveform = waveform;
    const channelList = document.getElementById("channelList");
    channelList.innerHTML = "";

    Object.keys(waveform.analog).forEach(channelName => {
        const label = document.createElement("label");
        label.style.display = "block";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = channelName;
        checkbox.checked = true;  // 默认全选
        checkbox.classList.add("channel-item");

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(" " + channelName));
        channelList.appendChild(label);
    });
}

// 搜索功能
function setupChannelSearch() {
    const searchInput = document.getElementById("channelSearch");
    if (!searchInput) return;

    searchInput.addEventListener("input", function () {
        const keyword = this.value.toLowerCase();
        document.querySelectorAll("#channelList label").forEach(label => {
            const text = label.textContent.toLowerCase();
            label.style.display = text.includes(keyword) ? "block" : "none";
        });
    });
}


// 全选 / 全不选
function selectAllChannels(select = true) {
    document.querySelectorAll("#channelList input[type=checkbox]").forEach(cb => {
        cb.checked = select;
    });
}

// 应用选择
function applySelectedChannels() {
    window.selectedChannels = Array.from(
        document.querySelectorAll("#channelList input[type=checkbox]:checked")
    ).map(cb => cb.value);

    if (!window.currentWaveform) return;

    // 保留原始结构，只筛选 analog 部分
    const filtered = {
        ...window.currentWaveform,  // 复制原始数据（包括 time 等）
        analog: {}
    };

    window.selectedChannels.forEach(ch => {
        if (window.currentWaveform.analog[ch]) {
            filtered.analog[ch] = window.currentWaveform.analog[ch];
        }
    });

    // 调用 main.js 的绘图函数
    if (typeof window.plotWaveforms === "function") {
        window.plotWaveforms(filtered, window.selectedChannels);
    } else {
        console.error("plotWaveforms 未定义，请确认 main.js 已正确加载");
    }
}

// 页面初始化时调用
document.addEventListener("DOMContentLoaded", setupChannelSearch);

// 挂到 window，避免重复声明报错
window.selectAllChannels = selectAllChannels;
window.applySelectedChannels = applySelectedChannels;
window.setupChannelSearch = setupChannelSearch;
