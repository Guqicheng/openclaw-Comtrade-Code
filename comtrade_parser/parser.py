# 提供包装接口调用 comtrade.py




# from .comtrade import Comtrade,Cfg
from .comtradecopy import Comtrade,Cfg

def parse_comtrade(cfg_path, dat_path):
    c = Comtrade()
    c.load(cfg_path, dat_path, encoding='gbk')

    d = Cfg()
    d.load(cfg_path,encoding='gbk')
 
    metadata = {
        "stationName": d.station_name,      # 变电站名称：来自 .cfg 文件第一行
        "recDevId": d.rec_dev_id,       # 设备 ID：来自 .cfg 文件第一行
        "revYear": d.rev_year,      # 文件版本：COMTRADE 格式版本（如 1991, 1999, 2013）

        "totalChannels": d.channels_count,      # 总通道数：模拟 + 数字通道总数
        "analogChannels": d.analog_count,       # 模拟通道数量
        "digitalChannels": d.status_count,      # 数字通道数量（也叫状态通道）

        "frequency": d.frequency,       # 系统频率（单位 Hz）：来自 .cfg 文件中 frequency 字段

        "nrates": d.nrates,     # 采样速率种类数量,文件中采样速率和种类
        # "totalSamplingCount": len(c.time),      #关于采样率从种类
        "samplingRates": d.sample_rates,    # 每种采样率的信息，如 [(1500, 10000.0)]
        "startTime": d.start_timestamp,     # 起始时间戳：记录数据开始时间，类型是 datetime
        "triggerTime": d.trigger_timestamp,     # 触发时间戳：记录发生事件的时间（如故障触发点）
        "fileFormat": c.ft,     # 文件格式类型：ASCII / BINARY / BINARY32
        "timeMultiplier": d.timemult,        # 时间乘数：用于时间轴还原，通常是 1。乘以 `c.time[i]` 得到真实时间（秒）
        "total_samples":c.total_samples  # 返回总点数



    }

    waveform = {
        # "time": [t * d.timemult for t in c.time],
        "time": [float(t * d.timemult) for t in c.time],
        # "time": list(t * d.timemult for t in c.time),  # 强制转为普通 list
        "analog": {
            ch.name: [float(v) for v in list(c.analog[i])]
            for i, ch in enumerate(d.analog_channels)
        }
    }

    return metadata, waveform
    # return metadata