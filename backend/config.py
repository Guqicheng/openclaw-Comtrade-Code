 # 配置如上传目录、允许类型等



# ===== backend/config.py =====
import os

UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), '..', 'uploads')
ALLOWED_EXTENSIONS = {'cfg', 'dat'}