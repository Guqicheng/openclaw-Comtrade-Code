// # ===== frontend/channelControls.js =====
// 通道选择、搜索、分组控制（模拟/数字独立操作）

function populateChannelList(waveform) {
    currentWaveform = waveform;

    const analogList = document.getElementById("analogChannelList");
    const digitalList = document.getElementById("digitalChannelList");
    if (!analogList || !digitalList) return;

    analogList.innerHTML = "";
    digitalList.innerHTML = "";

    selectedChannels = [];

    const analogKeys = Object.keys(waveform.analog);
    const digitalKeys = Object.keys(waveform.digital || {});

    // 模拟通道（默认选中）
    analogKeys.forEach(chName => {
        addChannelCheckbox(analogList, chName, true);
        selectedChannels.push(chName);
    });

    // 数字通道（默认不选）
    digitalKeys.forEach(chName => {
        addChannelCheckbox(digitalList, chName, false);
    });

    // 更新计数徽章
    const analogBadge = document.getElementById("analogCount");
    if (analogBadge) analogBadge.textContent = analogKeys.length;

    const digitalBadge = document.getElementById("digitalCount");
    if (digitalBadge) digitalBadge.textContent = digitalKeys.length;

    setupChannelSearch();
}

function addChannelCheckbox(parent, channelName, checked) {
    const label = document.createElement("label");
    label.style.cssText = "display:flex;align-items:center;gap:4px;padding:1px 0;cursor:pointer;font-size:12px;";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = channelName;
    checkbox.checked = checked;

    checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
            if (!selectedChannels.includes(channelName)) selectedChannels.push(channelName);
        } else {
            selectedChannels = selectedChannels.filter(c => c !== channelName);
        }
    });

    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(channelName));
    parent.appendChild(label);
}

function setupChannelSearch() {
    const searchInput = document.getElementById("channelSearch");
    if (!searchInput) return;

    const newInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newInput, searchInput);

    newInput.addEventListener("input", function () {
        const keyword = this.value.toLowerCase();
        document.querySelectorAll("#analogChannelList label, #digitalChannelList label").forEach(label => {
            const text = label.textContent.toLowerCase();
            label.style.display = text.includes(keyword) ? "flex" : "none";
        });
    });
}

// ===== 模拟通道分组控制 =====
function selectAnalogAll(select = true) {
    const checkboxes = document.querySelectorAll("#analogChannelList input[type=checkbox]");
    checkboxes.forEach(cb => {
        cb.checked = select;
        const name = cb.value;
        if (select) {
            if (!selectedChannels.includes(name)) selectedChannels.push(name);
        } else {
            selectedChannels = selectedChannels.filter(c => c !== name);
        }
    });
}

function applyAnalog() {
    if (!currentWaveform) return;
    const analogChecked = Array.from(document.querySelectorAll("#analogChannelList input:checked")).map(cb => cb.value);
    const digitalSelected = selectedChannels.filter(c =>
        Object.keys(currentWaveform.digital || {}).includes(c)
    );
    selectedChannels = [...analogChecked, ...digitalSelected];
    renderPlots();
}

// ===== 数字通道分组控制 =====
function selectDigitalAll(select = true) {
    const checkboxes = document.querySelectorAll("#digitalChannelList input[type=checkbox]");
    checkboxes.forEach(cb => {
        cb.checked = select;
        const name = cb.value;
        if (select) {
            if (!selectedChannels.includes(name)) selectedChannels.push(name);
        } else {
            selectedChannels = selectedChannels.filter(c => c !== name);
        }
    });
}

function applyDigital() {
    if (!currentWaveform) return;
    const analogSelected = selectedChannels.filter(c =>
        Object.keys(currentWaveform.analog || {}).includes(c)
    );
    const digitalChecked = Array.from(document.querySelectorAll("#digitalChannelList input:checked")).map(cb => cb.value);
    selectedChannels = [...analogSelected, ...digitalChecked];
    renderPlots();
}

// 页面初始化时调用
document.addEventListener("DOMContentLoaded", setupChannelSearch);
