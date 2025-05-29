# 调用解析逻辑与业务处理

# ===== backend/services.py =====
import os
from werkzeug.utils import secure_filename
from comtrade_parser.parser import parse_comtrade
from .config import UPLOAD_FOLDER

def save_files(cfg_file, dat_file):
    cfg_name = secure_filename(cfg_file.filename)
    dat_name = secure_filename(dat_file.filename)

    cfg_path = os.path.join(UPLOAD_FOLDER, cfg_name)  
    dat_path = os.path.join(UPLOAD_FOLDER, dat_name)

    cfg_file.save(cfg_path)
    dat_file.save(dat_path)

    return cfg_path, dat_path

def process_comtrade_files(cfg_path, dat_path):
    return parse_comtrade(cfg_path, dat_path)
