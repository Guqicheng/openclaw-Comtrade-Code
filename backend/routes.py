# 路由定义

# ===== backend/routes.py =====
from flask import Blueprint, request, jsonify
from .services import save_files, process_comtrade_files

bp = Blueprint('routes', __name__)

@bp.route('/upload', methods=['POST'])
def upload():
    if 'cfg' not in request.files or 'dat' not in request.files:
        return jsonify({'error': '必须同时上传 .cfg 和 .dat 文件'}), 400

    cfg_file = request.files['cfg']
    dat_file = request.files['dat']

    cfg_path, dat_path = save_files(cfg_file, dat_file)

    try:
        metadata, waveform = process_comtrade_files(cfg_path, dat_path)
        return jsonify({'metadata': metadata, 'waveform': waveform})
    except Exception as e:
        return jsonify({'error': str(e)}), 500