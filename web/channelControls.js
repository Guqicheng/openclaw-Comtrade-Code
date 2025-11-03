// # ===== frontend/channelControls.js =====
// 控制通道选择、搜索、全选/全不选/应用选择

// 初始化通道列表
function populateChannelList(waveform) {
    // currentWaveform = waveform;
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

    // ✅ 默认全选
    selectedChannels = Object.keys(waveform.analog);
    setupChannelSearch(); // 初始化搜索
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

// ✅ 全选 / 全不选
function selectAllChannels(select = true) {
    document.querySelectorAll("#channelList input[type=checkbox]").forEach(cb => {
        cb.checked = select;
    });
    selectedChannels = select ? Object.keys(currentWaveform.analog) : [];
}

// ✅ 应用选择
function applySelectedChannels() {
    if (!currentWaveform) return;
    // 更新选中的通道
    selectedChannels = Array.from(
        document.querySelectorAll("#channelList input[type=checkbox]:checked")
    ).map(cb => cb.value);

    renderPlots();
}

// 页面初始化时调用
document.addEventListener("DOMContentLoaded", setupChannelSearch);
