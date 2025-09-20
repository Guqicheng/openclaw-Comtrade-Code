# 路由定义

# ===== backend/routes.py =====
from flask import Blueprint, request, jsonify, current_app
from .services import save_files, process_comtrade_files
from comtrade_parser.parser import parse_comtrade

import os


bp = Blueprint('routes', __name__)

@bp.route('/upload', methods=['POST'])
def upload():
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

        # 解析 COMTRADE
        metadata, waveform = parse_comtrade(cfg_path, dat_path)
        return jsonify({"metadata": metadata, "waveform": waveform})

    except Exception as e:
        return jsonify({"error": str(e)}), 500