# 提供包装接口调用 comtrade.py
# ===== comtrade_parser/parser.py =====

# from .comtrade import Comtrade,Cfg
from .comtradecopy import Comtrade,Cfg

def parse_metadata(cfg_path, dat_path):
    reader = Comtrade()
    reader.load(cfg_path, dat_path, encoding='gbk') # 需要添加encoding单独声明字符编码否则报错

    cfg = Cfg()
    cfg.load(cfg_path,encoding='gbk')
 
    metadata = {
        "stationName": cfg.station_name,      # 变电站名称：来自 .cfg 文件第一行
        "recDevId": cfg.rec_dev_id,       # 设备 ID：来自 .cfg 文件第一行
        "revYear": cfg.rev_year,      # 文件版本：COMTRADE 格式版本（如 1991, 1999, 2013）

        "totalChannels": cfg.channels_count,      # 总通道数：模拟 + 数字通道总数
        "analogChannels": cfg.analog_count,       # 模拟通道数量
        "digitalChannels": cfg.status_count,      # 数字通道数量（也叫状态通道）

        "frequency": cfg.frequency,       # 系统频率（单位 Hz）：来自 .cfg 文件中 frequency 字段

        "nrates": cfg.nrates,     # 采样速率种类数量,文件中采样速率和种类
        # "totalSamplingCount": len(c.time),      #关于采样率从种类(弃用)
        "samplingRates": cfg.sample_rates,    # 每种采样率的信息，如 [(1500, 10000.0)]
        "startTime": cfg.start_timestamp,     # 起始时间戳：记录数据开始时间，类型是 datetime
        "triggerTime": cfg.trigger_timestamp,     # 触发时间戳：记录发生事件的时间（如故障触发点）

        "fileFormat": reader.ft,     # 文件格式类型：ASCII / BINARY / BINARY32
        "timeMultiplier": cfg.timemult,        # 时间乘数：用于时间轴还原，通常是 1。乘以 `c.time[i]` 得到真实时间（秒）
        "total_samples":reader.total_samples  # 返回总点数



    }

    # <<< 修改点：返回 reader 给后端以便需要调试 >>>    
    return reader, metadata