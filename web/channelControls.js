// # ===== frontend/channelControls.js =====
// 控制通道选择、搜索、全选/全不选/应用选择

// 初始化通道列表
function populateChannelList(waveform) {

    currentWaveform = waveform;

     // <<< 修改点：改为双列表 >>> 
    const analogList = document.getElementById("analogChannelList");
    const digitalList = document.getElementById("digitalChannelList");

    if (!analogList || !digitalList) return;

    analogList.innerHTML = "";
    digitalList.innerHTML = "";

    selectedChannels = [];

    // === 1) 模拟通道（默认选中） ===                
    Object.keys(waveform.analog).forEach(channelName => {
        addChannelCheckbox(analogList, channelName, true);
        selectedChannels.push(channelName);
    }); 

    // === 2) 数字通道（默认不选中） ===
    Object.keys(waveform.digital || {}).forEach(channelName => {
        addChannelCheckbox(digitalList, channelName, false);
    });

    // ✅ 默认全选
    // selectedChannels = Object.keys(waveform.analog);
    setupChannelSearch(); // 初始化搜索
}

function addChannelCheckbox(parent, channelName, checked) {
    const label = document.createElement("label");
    label.style.display = "block";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = channelName;
    checkbox.checked = checked;

    checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
            if (!selectedChannels.includes(channelName))
                selectedChannels.push(channelName);
        } else {
            selectedChannels = selectedChannels.filter(c => c !== channelName);
        }
    });

    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(" " + channelName));
    parent.appendChild(label);
}


// 搜索功能
function setupChannelSearch() {
    const searchInput = document.getElementById("channelSearch");
    if (!searchInput) return;

    searchInput.addEventListener("input", function () {
        const keyword = this.value.toLowerCase();

        document.querySelectorAll("#analogChannelList label, #digitalChannelList label").forEach(label => {
            const text = label.textContent.toLowerCase();
            label.style.display = text.includes(keyword) ? "block" : "none";
        });
    });
}

// === 全选 / 全不选 ===
function selectAllChannels(select = true) {

    document.querySelectorAll("#analogChannelList input, #digitalChannelList input").forEach(cb => {
        cb.checked = select;
    });

    if (select) {
        selectedChannels = [
            ...Object.keys(currentWaveform.analog),
            ...Object.keys(currentWaveform.digital || {})
        ];
    } else {
        selectedChannels = [];
    }
}

// ✅ 应用选择
function applySelectedChannels() {
    if (!currentWaveform) return;
    // 更新选中的通道
    selectedChannels = Array.from(
        document.querySelectorAll("#analogChannelList input:checked, #digitalChannelList input:checked")
    ).map(cb => cb.value);

    renderPlots();
}

// ===== 模拟通道分组控制 =====
function selectAnalogChannels(select = true) {
  const checkboxes = document.querySelectorAll(
    "#analogChannelList input[type=checkbox]"
  );

  checkboxes.forEach(cb => {
    cb.checked = select;
    const name = cb.value;

    if (select) {
      if (!selectedChannels.includes(name)) {
        selectedChannels.push(name);
      }
    } else {
      selectedChannels = selectedChannels.filter(c => c !== name);
    }
  });
}

// ===== 数字通道分组控制 =====
function selectDigitalChannels(select = true) {
  const checkboxes = document.querySelectorAll(
    "#digitalChannelList input[type=checkbox]"
  );

  checkboxes.forEach(cb => {
    cb.checked = select;
    const name = cb.value;

    if (select) {
      if (!selectedChannels.includes(name)) {
        selectedChannels.push(name);
      }
    } else {
      selectedChannels = selectedChannels.filter(c => c !== name);
    }
  });
}



// 页面初始化时调用
document.addEventListener("DOMContentLoaded", setupChannelSearch);
