# ===== backend/analysis_routes.py =====
# 分析功能 API：RMS、峰值、FFT、相角差（按 analysis_id 绑定会话）

from flask import Blueprint, request, jsonify
from .analysis import (
    calculate_rms,
    detect_peaks,
    calculate_fft,
    calculate_phase_difference,
)
from .session_store import create_session, get_session
from comtrade_parser.parser import parse_metadata

analysis_bp = Blueprint("analysis", __name__)


def _reader_from_request_json(data: dict | None):
    """从 JSON 体解析 analysisId，返回 (reader, error_response)。"""
    if not data:
        return None, (jsonify({"error": "缺少请求体"}), 400)
    analysis_id = data.get("analysisId") or data.get("analysis_id")
    if not analysis_id:
        return None, (jsonify({"error": "缺少 analysisId，请先上传 COMTRADE 文件"}), 400)
    session = get_session(analysis_id)
    if session is None:
        return None, (jsonify({"error": "无效或已过期的 analysisId"}), 404)
    return session.reader, None


def _reader_from_query():
    analysis_id = request.args.get("analysisId") or request.args.get("analysis_id")
    if not analysis_id:
        return None, (jsonify({"error": "缺少 analysisId 查询参数"}), 400)
    session = get_session(analysis_id)
    if session is None:
        return None, (jsonify({"error": "无效或已过期的 analysisId"}), 404)
    return session.reader, None


def _channel_values(reader, channel_name: str):
    for i, ch in enumerate(reader.cfg.analog_channels):
        if ch.name == channel_name:
            return list(reader.analog[i])
    return None


@analysis_bp.route("/analysis/load", methods=["POST"])
def analysis_load():
    """通过路径加载并注册会话（备用；主路径为 /upload 返回 analysisId）。"""
    try:
        data = request.get_json() or {}
        cfg_path = data.get("cfgPath")
        dat_path = data.get("datPath")
        if not cfg_path or not dat_path:
            return jsonify({"error": "缺少文件路径"}), 400
        reader, _ = parse_metadata(cfg_path, dat_path)
        analysis_id = create_session(reader, cfg_path, dat_path)
        return jsonify({"status": "ok", "analysisId": analysis_id})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@analysis_bp.route("/analysis/rms", methods=["POST"])
def analysis_rms():
    try:
        reader, err = _reader_from_request_json(request.get_json())
        if err:
            return err

        data = request.get_json()
        channel_name = data.get("channelName", "")
        cycle_freq = data.get("cycleFreq", 50)

        values = _channel_values(reader, channel_name)
        if values is None:
            return jsonify({"error": f"未找到通道: {channel_name}"}), 404

        result = calculate_rms(values, list(reader.time), cycle_freq)
        return jsonify({"channelName": channel_name, **result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@analysis_bp.route("/analysis/peaks", methods=["POST"])
def analysis_peaks():
    try:
        reader, err = _reader_from_request_json(request.get_json())
        if err:
            return err

        data = request.get_json()
        channel_name = data.get("channelName", "")
        threshold_ratio = data.get("thresholdRatio", 0.1)

        values = _channel_values(reader, channel_name)
        if values is None:
            return jsonify({"error": f"未找到通道: {channel_name}"}), 404

        result = detect_peaks(values, threshold_ratio)
        time_values = list(reader.time)
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
            "valleys": valleys_with_time,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@analysis_bp.route("/analysis/fft", methods=["POST"])
def analysis_fft():
    try:
        reader, err = _reader_from_request_json(request.get_json())
        if err:
            return err

        data = request.get_json()
        channel_name = data.get("channelName", "")

        values = _channel_values(reader, channel_name)
        if values is None:
            return jsonify({"error": f"未找到通道: {channel_name}"}), 404

        sampling_rate = 0
        if reader.cfg.sample_rates:
            sampling_rate = reader.cfg.sample_rates[0][0]
        if sampling_rate <= 0:
            return jsonify({"error": "无法获取采样率"}), 400

        result = calculate_fft(values, sampling_rate)
        if isinstance(result, dict) and result.get("error"):
            return jsonify(result), 400

        result["channelName"] = channel_name
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@analysis_bp.route("/analysis/phase-diff", methods=["POST"])
def analysis_phase_diff():
    try:
        reader, err = _reader_from_request_json(request.get_json())
        if err:
            return err

        data = request.get_json()
        ch_a_name = data.get("channelA", "")
        ch_b_name = data.get("channelB", "")

        values_a = _channel_values(reader, ch_a_name)
        values_b = _channel_values(reader, ch_b_name)
        if values_a is None:
            return jsonify({"error": f"未找到通道A: {ch_a_name}"}), 404
        if values_b is None:
            return jsonify({"error": f"未找到通道B: {ch_b_name}"}), 404

        n = min(len(values_a), len(values_b))
        values_a = values_a[:n]
        values_b = values_b[:n]

        sampling_rate = 0
        if reader.cfg.sample_rates:
            sampling_rate = reader.cfg.sample_rates[0][0]
        fundamental_freq = reader.cfg.frequency or 50

        result = calculate_phase_difference(
            values_a, values_b, sampling_rate, fundamental_freq
        )
        if isinstance(result, dict) and result.get("error"):
            return jsonify(result), 400

        result["channelA"] = ch_a_name
        result["channelB"] = ch_b_name
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@analysis_bp.route("/analysis/channels", methods=["GET"])
def analysis_channels():
    try:
        reader, err = _reader_from_query()
        if err:
            return err
        channels = [ch.name for ch in reader.cfg.analog_channels]
        return jsonify({"channels": channels})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
