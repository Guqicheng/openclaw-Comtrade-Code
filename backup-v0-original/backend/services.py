# ===== backend/services.py =====
# 业务处理模块：负责安全保存上传文件，并调用 COMTRADE 解析逻辑。

import os
from werkzeug.utils import secure_filename
from comtrade_parser.parser import parse_metadata
from .config import UPLOAD_FOLDER

def save_files(cfg_file, dat_file):
    """保存上传的 cfg/dat 文件到 UPLOAD_FOLDER，并返回文件路径。"""
    cfg_name = secure_filename(cfg_file.filename)
    dat_name = secure_filename(dat_file.filename)

    cfg_path = os.path.join(UPLOAD_FOLDER, cfg_name)
    dat_path = os.path.join(UPLOAD_FOLDER, dat_name)

    cfg_file.save(cfg_path)
    dat_file.save(dat_path)

    return cfg_path, dat_path

def process_comtrade_files(cfg_path, dat_path):
    """调用 COMTRADE 解析函数，返回解析后的元信息和波形。"""
    return parse_metadata(cfg_path, dat_path)
