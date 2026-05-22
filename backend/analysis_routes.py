# ===== backend/analysis_routes.py =====
# 分析功能 API 路由：RMS计算、峰值检测、FFT谐波分析、相角差计算

from flask import Blueprint, request, jsonify
from .analysis import calculate_rms, detect_peaks, calculate_fft, calculate_phase_difference
from comtrade_parser.parser import parse_metadata
import os

analysis_bp = Blueprint('analysis', __name__)

# 存储当前解析的 reader 对象，供分析接口复用
_current_reader = None
_current_cfg_path = None
_current_dat_path = None


def set_current_reader(reader):
    """直接设置已解析好的 reader 对象（避免二次解析）"""
    global _current_reader
    _current_reader = reader

def set_current_files(cfg_path, dat_path):
    """通过文件路径解析并设置 reader（备用，优先用 set_current_reader）"""
    global _current_cfg_path, _current_dat_path, _current_reader
    _current_cfg_path = cfg_path
    _current_dat_path = dat_path
    r, _ = parse_metadata(cfg_path, dat_path)
    _current_reader = r


@analysis_bp.route('/analysis/load', methods=['POST'])
def analysis_load():
    """分析接口：接收文件路径并加载解析器（由上传接口调用）"""
    try:
        data = request.get_json()
        cfg_path = data.get('cfgPath')
        dat_path = data.get('datPath')
        if not cfg_path or not dat_path:
            return jsonify({"error": "缺少文件路径"}), 400
        set_current_files(cfg_path, dat_path)
        return jsonify({"status": "ok"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@analysis_bp.route('/analysis/rms', methods=['POST'])
def analysis_rms():
    """
    RMS 有效值计算接口。
    请求体: { "channelName": "xxx", "cycleFreq": 50 }
    返回: { "overall": ..., "perCycle": [...] }
    """
    try:
        global _current_reader
        if _current_reader is None:
            return jsonify({"error": "请先上传 COMTRADE 文件"}), 400

        data = request.get_json()
        channel_name = data.get('channelName', '')
        cycle_freq = data.get('cycleFreq', 50)

        # 查找通道
        values = None
        for i, ch in enumerate(_current_reader.cfg.analog_channels):
            if ch.name == channel_name:
                values = list(_current_reader.analog[i])
                break

        if values is None:
            return jsonify({"error": f"未找到通道: {channel_name}"}), 404

        result = calculate_rms(values, list(_current_reader.time), cycle_freq)
        return jsonify({
            "channelName": channel_name,
            **result
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@analysis_bp.route('/analysis/peaks', methods=['POST'])
def analysis_peaks():
    """
    峰值检测接口。
    请求体: { "channelName": "xxx", "thresholdRatio": 0.1 }
    返回: { "channelName": ..., "peaks": [...], "valleys": [...] }
    """
    try:
        global _current_reader
        if _current_reader is None:
            return jsonify({"error": "请先上传 COMTRADE 文件"}), 400

        data = request.get_json()
        channel_name = data.get('channelName', '')
        threshold_ratio = data.get('thresholdRatio', 0.1)

        values = None
        for i, ch in enumerate(_current_reader.cfg.analog_channels):
            if ch.name == channel_name:
                values = list(_current_reader.analog[i])
                break

        if values is None:
            return jsonify({"error": f"未找到通道: {channel_name}"}), 404

        result = detect_peaks(values, threshold_ratio)
        # 将索引转换为时间
        time_values = list(_current_reader.time)
        peaks_with_time = [
            {"time": time_values[idx], "value": val, "index": idx}
            for idx, val in result.get("peaks", [])
            if idx < len(time_values)
        ]
        valleys_with_time = [
            {"time": time_values[idx], "value": val, "index": idx}
            for idx, val in result.get("valleys", [])
            if idx < len(time_values)
        ]

        return jsonify({
            "channelName": channel_name,
            "peaks": peaks_with_time,
            "valleys": valleys_with_time
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@analysis_bp.route('/analysis/fft', methods=['POST'])
def analysis_fft():
    """
    FFT 谐波分析接口。
    请求体: { "channelName": "xxx" }
    返回: { "frequencies": [...], "magnitudes": [...], "fundamentalFreq": ..., "thd": ..., "harmonics": [...] }
    """
    try:
        global _current_reader
        if _current_reader is None:
            return jsonify({"error": "请先上传 COMTRADE 文件"}), 400

        data = request.get_json()
        channel_name = data.get('channelName', '')

        values = None
        for i, ch in enumerate(_current_reader.cfg.analog_channels):
            if ch.name == channel_name:
                values = list(_current_reader.analog[i])
                break

        if values is None:
            return jsonify({"error": f"未找到通道: {channel_name}"}), 404

        # 获取采样率
        sampling_rate = 0
        if _current_reader.cfg.sample_rates:
            sampling_rate = _current_reader.cfg.sample_rates[0][0]

        if sampling_rate <= 0:
            return jsonify({"error": "无法获取采样率"}), 400

        result = calculate_fft(values, sampling_rate)
        result["channelName"] = channel_name

        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@analysis_bp.route('/analysis/phase-diff', methods=['POST'])
def analysis_phase_diff():
    """
    相角差计算接口。
    请求体: { "channelA": "xxx", "channelB": "yyy" }
    返回: { "phaseDiffDeg": ..., "channelA": {...}, "channelB": {...} }
    """
    try:
        global _current_reader
        if _current_reader is None:
            return jsonify({"error": "请先上传 COMTRADE 文件"}), 400

        data = request.get_json()
        ch_a_name = data.get('channelA', '')
        ch_b_name = data.get('channelB', '')

        values_a = None
        values_b = None
        for i, ch in enumerate(_current_reader.cfg.analog_channels):
            if ch.name == ch_a_name:
                values_a = list(_current_reader.analog[i])
            if ch.name == ch_b_name:
                values_b = list(_current_reader.analog[i])

        if values_a is None:
            return jsonify({"error": f"未找到通道A: {ch_a_name}"}), 404
        if values_b is None:
            return jsonify({"error": f"未找到通道B: {ch_b_name}"}), 404

        # 取较短的序列长度
        n = min(len(values_a), len(values_b))
        values_a = values_a[:n]
        values_b = values_b[:n]

        sampling_rate = 0
        if _current_reader.cfg.sample_rates:
            sampling_rate = _current_reader.cfg.sample_rates[0][0]

        fundamental_freq = _current_reader.cfg.frequency or 50

        result = calculate_phase_difference(values_a, values_b, sampling_rate, fundamental_freq)
        result["channelA"] = ch_a_name
        result["channelB"] = ch_b_name

        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@analysis_bp.route('/analysis/channels', methods=['GET'])
def analysis_channels():
    """返回当前文件的所有模拟通道名称列表"""
    try:
        global _current_reader
        if _current_reader is None:
            return jsonify({"error": "请先上传 COMTRADE 文件"}), 400

        channels = [ch.name for ch in _current_reader.cfg.analog_channels]
        return jsonify({"channels": channels})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
