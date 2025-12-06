
```
test1.2
├─ app.spec    ← 设置文件
├─ backend     ← Flask API、业务逻辑
│  ├─ app.py    ← Flask 启动入口（最重要）
│  ├─ config.py     ← 配置文件
│  ├─ routes.py     ← 路由接口定义
│  ├─ services.py   ← 业务逻辑（解析、处理）
│  ├─ __init__.py   ← Flask 标识文件
│  └─ __pycache__   ← 自动生成文件
│     ├─ app.cpython-38.pyc
│     ├─ config.cpython-38.pyc
│     ├─ routes.cpython-38.pyc
│     ├─ services.cpython-38.pyc
│     └─ __init__.cpython-38.pyc
│
├─ comtrade_parser     ← 处理 COMTRADE 文件   
│  ├─ comtradecopy.py   ← COMTRADE 主解析器
│  ├─ parser.py     ← 执行 .cfg / .dat 解析的代码
│  ├─ __init__.py   ←  模块 标识文件
│  └─ __pycache__   ← 自动生成文件
│     ├─ comtrade.cpython-38.pyc
│     ├─ comtradecopy.cpython-38.pyc
│     ├─ parser.cpython-38.pyc
│     └─ __init__.cpython-38.pyc
├─ README.md
├─ uploads      ← 上传文件目录
│  ├─ DRL600B_DRec_30672_20121106_014133_508_S.CFG
│  └─ DRL600B_DRec_30672_20121106_014133_508_S.DAT
└─ web      ← 前端页面 + Plotly 波形图展示
   ├─ channelControls.js    ← 控制通道选项
   ├─ index.html    ← 前端主页面
   ├─ main.js      ← 与后端交互、加载波形图
   ├─ plotly-latest.min.js      ← Plotly 图表库
   ├─ plotly.js     ← Plotly 图表库
   └─ style.css     ← 页面样式

```