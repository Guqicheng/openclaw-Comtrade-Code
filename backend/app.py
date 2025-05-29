# 启动入口

# ===== backend/app.py =====
from flask import Flask, send_from_directory
from backend.routes import bp
from backend.config import UPLOAD_FOLDER
import os

def create_app():
    app = Flask(__name__)
    app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

    app.config['DEBUG'] = True  # 生产环境需关闭！

    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    app.register_blueprint(bp)

    @app.route('/')
    def index():
        return send_from_directory('../frontend', 'index.html')

    @app.route('/<path:path>')
    def static_proxy(path):
        return send_from_directory('../frontend', path)

    return app

if __name__ == '__main__':
    app = create_app()
    app.run(debug=True, host='0.0.0.0',port=7000)