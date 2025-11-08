# 启动入口

# ===== backend/app.py =====
import os
import sys
import webbrowser
import threading
from flask import Flask, send_from_directory
from backend.routes import bp
from backend.config import UPLOAD_FOLDER


def get_web_path():
    """
    获取 web 静态资源路径
    ✅ 开发环境：../web
    ✅ PyInstaller：sys._MEIPASS/web
    """
    if hasattr(sys, '_MEIPASS'):     # 正在运行 exe
        return os.path.join(sys._MEIPASS, "web")
    else:                            # 普通开发运行
        return os.path.join(os.path.dirname(__file__), "..", "web")


def create_app():
    app = Flask(__name__)
    app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
    app.register_blueprint(bp)

    web_dir = get_web_path()

    @app.route('/')
    def index():
        return send_from_directory(web_dir, 'index.html')

    @app.route('/<path:path>')
    def static_proxy(path):
        return send_from_directory(web_dir, path)

    return app


def open_browser(port=7000):
    url = f"http://127.0.0.1:{port}"
    webbrowser.open(url)


if __name__ == '__main__':
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)

    app = create_app()

    port = 7000

    # ✅ 仅 EXE 自动打开浏览器
    if getattr(sys, 'frozen', False):
        threading.Timer(1.0, open_browser, args=(port,)).start()

    app.run(host='0.0.0.0', port=port)
