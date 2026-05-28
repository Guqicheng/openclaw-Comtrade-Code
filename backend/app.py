# ===== backend/app.py =====
# 项目启动入口：创建 Flask 应用、注册后端接口、加载前端页面，并支持 EXE 自动打开浏览器。

import os
import sys
import logging
import webbrowser
import threading
from flask import Flask, send_from_directory
from backend.routes import bp
from backend.analysis_routes import analysis_bp
from backend.config import UPLOAD_FOLDER


def get_web_path():
    """
    获取 web 静态资源路径
    开发环境：../web
    PyInstaller：sys._MEIPASS/web
    """
    #
    if hasattr(sys, '_MEIPASS'):     # 正在运行 exe
        return os.path.join(sys._MEIPASS, "web")
    else:                            # 普通开发运行
        return os.path.join(os.path.dirname(__file__), "..", "web")


def create_app():
    """创建 Flask 应用并绑定 API 蓝图与前端静态资源路由。"""
    app = Flask(__name__)
    app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

    # ── 日志配置 ──
    handler = logging.FileHandler(os.path.join(os.path.dirname(__file__), '..', 'app.log'))
    handler.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(message)s'))
    app.logger.addHandler(handler)
    app.logger.setLevel(logging.INFO)
    app.logger.info('应用启动')

    app.register_blueprint(bp)
    app.register_blueprint(analysis_bp)

    web_dir = get_web_path()

    @app.route('/')
    def index():
        """返回前端主页。"""
        return send_from_directory(web_dir, 'index.html')

    @app.route('/<path:path>')
    def static_proxy(path):
        """映射所有前端静态资源。"""
        return send_from_directory(web_dir, path)

    return app


def open_browser(port=7000):
    """自动打开浏览器访问服务地址。"""
    url = f"http://127.0.0.1:{port}"
    webbrowser.open(url)


if __name__ == '__main__':
    """程序入口：创建上传目录、启动 Flask；在 EXE 环境下自动打开浏览器。"""
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)

    app = create_app()
    port = 7000

    #  仅 EXE 自动打开浏览器
    if getattr(sys, 'frozen', False):
        threading.Timer(1.0, open_browser, args=(port,)).start()

    app.run(host='0.0.0.0', port=port)
