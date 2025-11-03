# 启动入口

# ===== backend/app.py =====
from flask import Flask, send_from_directory
from backend.routes import bp
from backend.config import UPLOAD_FOLDER
import os
import webbrowser
import threading


def create_app():
    app = Flask(__name__)
    app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
    app.config['DEBUG'] = True  # 注意：正式环境要关闭

    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    app.register_blueprint(bp)

    @app.route('/')
    def index():
        return send_from_directory('../web', 'index.html')

    @app.route('/<path:path>')
    def static_proxy(path):
        return send_from_directory('../web', path)

    return app


def open_browser(port=7000):
    """延迟 1 秒打开浏览器，避免 Flask 尚未启动完毕"""
    url = f"http://127.0.0.1:{port}"
    webbrowser.open(url)


if __name__ == '__main__':
    app = create_app()

    port = 7000
    threading.Timer(1.0, open_browser, args=(port,)).start()

    app.run(debug=True, host='0.0.0.0', port=port)

