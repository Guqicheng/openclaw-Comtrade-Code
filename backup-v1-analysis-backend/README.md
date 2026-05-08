备份节点: v1
==========
改动时间: 2026-05-07
改动内容: 新增后端分析模块
新增文件:
  - backend/analysis.py       信号分析核心（RMS、峰值、FFT、相角差）
  - backend/analysis_routes.py 分析 API 路由（5个接口）
修改文件:
  - backend/routes.py          上传后自动调用 set_current_files
  - backend/app.py             注册 analysis_bp 蓝图
