# ===== backend/routes.py =====
# 定义后端 API 路由：处理文件上传、校验、保存，并调用 COMTRADE 解析逻辑。

from flask import Blueprint, request, jsonify, current_app
from .services import process_comtrade_files, downsample, MAX_DISPLAY_POINTS
from .session_store import create_session
import os

bp = Blueprint('routes', __name__)


@bp.route('/upload', methods=['POST'])
def upload():
    """处理前端上传的 .cfg 和 .dat 文件：校验、保存并解析 COMTRADE 数据。"""
    try:
        cfg_file = request.files['cfg']
        dat_file = request.files['dat']

        # 取文件名（不含扩展名）
        cfg_name, cfg_ext = os.path.splitext(cfg_file.filename)
        dat_name, dat_ext = os.path.splitext(dat_file.filename)

        # 校验扩展名
        if cfg_ext.lower() != ".cfg" or dat_ext.lower() != ".dat":
            return jsonify({"error": "必须上传 .cfg 和 .dat 文件"}), 400

        # 校验文件名前缀是否一致
        if cfg_name != dat_name:
            return jsonify({"error": f"文件名不匹配：{cfg_file.filename} 与 {dat_file.filename}"}), 400

        # 保存文件
        cfg_path = os.path.join(current_app.config['UPLOAD_FOLDER'], cfg_file.filename)
        dat_path = os.path.join(current_app.config['UPLOAD_FOLDER'], dat_file.filename)
        cfg_file.save(cfg_path)
        dat_file.save(dat_path)

        # ===== 只解析一次 =====
        reader, metadata = process_comtrade_files(cfg_path, dat_path)
        analysis_id = create_session(reader, cfg_path, dat_path)

        # ===== 构造波形数据（带降采样）=====
        raw_time = list(reader.time)
        n = len(raw_time)

        # 是否需要降采样
        need_downsample = n > MAX_DISPLAY_POINTS
        ds = downsample if need_downsample else (lambda v, _: list(v))

        time = ds(raw_time, MAX_DISPLAY_POINTS)

        analog = {}
        for i, ch in enumerate(reader.cfg.analog_channels):
            analog[ch.name] = ds(reader.analog[i], MAX_DISPLAY_POINTS)

        digital = {}
        for i, ch in enumerate(reader.cfg.status_channels):
            digital[ch.name] = ds(reader.status[i], MAX_DISPLAY_POINTS)

        waveform = {
            "time": time,
            "analog": analog,
            "digital": digital
        }

        return jsonify({
            "analysisId": analysis_id,
            "metadata": metadata,
            "waveform": waveform,
        })

    except Exception as e:
        current_app.logger.exception("上传失败: %s", str(e))
        return jsonify({"error": str(e)}), 500
