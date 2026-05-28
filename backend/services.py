# ===== backend/services.py =====
# 业务处理模块：负责安全保存上传文件、降采样，并调用 COMTRADE 解析逻辑。

import os
from werkzeug.utils import secure_filename
from comtrade_parser.parser import parse_metadata
from .config import UPLOAD_FOLDER


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
