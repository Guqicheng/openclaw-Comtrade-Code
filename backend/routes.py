# ===== backend/routes.py =====
# 定义后端 API 路由：处理文件上传、校验、保存，并调用 COMTRADE 解析逻辑。

from flask import Blueprint, request, jsonify, current_app
from .services import save_files, process_comtrade_files
from .analysis_routes import set_current_reader
from comtrade_parser.parser import parse_metadata
import os
import math

bp = Blueprint('routes', __name__)

# 波形数据最大点数（以 2K 屏 2560px 为基准，留 3 倍余量保证曲线平滑）
# 超过此值自动降采样，加快传输和前端渲染
MAX_DISPLAY_POINTS = 8000


def downsample(values, max_points):
    """
    降采样：如果数据超过 max_points，均匀抽取保留波形趋势。
    返回降采样后的列表。
    """
    n = len(values)
    if n <= max_points:
        return list(values)

    step = n / max_points
    result = []
    for i in range(max_points):
        idx = int(i * step)
        if idx >= n:
            idx = n - 1
        result.append(values[idx])
    return result


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
        reader, metadata = parse_metadata(cfg_path, dat_path)
        set_current_reader(reader)  # 直接传 reader，不再二次解析

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
            "metadata": metadata,
            "waveform": waveform
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500
