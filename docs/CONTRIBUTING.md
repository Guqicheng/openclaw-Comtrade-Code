# 贡献与开发规范

## 架构优先（高于 UI）

- 先确认改动属于哪一层（见 `docs/ARCHITECTURE.md`），再写代码。
- 禁止为省事在 `routes` 里堆业务逻辑，或在 `web/` 里做后端计算。
- 新功能先写**模块职责**和**API 契约**（可写在 PR 描述），再实现。

## 代码规范

### Python（backend + comtrade_parser）

- Python 3.12+，4 空格缩进
- 公共函数写 docstring（参数、返回值、异常）
- 分析逻辑放 `analysis.py`，保持可单测
- 使用 `logging`，禁止仅用 `print` 排生产问题（见路线图 O5）

### JavaScript（web）

- 保持现有 vanilla JS 风格，不引入框架除非 ADR 批准
- 新文件按职责命名：`plotRenderer.js`、`zoomSync.js` 等（见路线图 O7）
- 避免新增全局函数污染 `window`，优先 IIFE 或单入口模块对象

## 测试

- 核心分析函数（RMS、峰值、相位差）应有 `pytest` 用例
- 解析器至少覆盖：ASCII/BINARY、异常帧、gbk cfg
- PR 若改分析逻辑，应附带或更新测试

## Pull Request 清单

- [ ] 说明影响的**架构层**与模块
- [ ] 是否更新 `CONTEXT.md` / `docs/adr/`
- [ ] 是否对标 CAAP2008X 或行业做法（一句话）
- [ ] 本地 `check_dev.bat` 或 `pytest` 通过
- [ ] 无提交 `venv/`、`__pycache__/`、`uploads/` 大文件

## 工作区边界（必读）

- `E:\开发项目\docs\BOUNDARIES.md`
- `E:\开发项目\docs\FRAMEWORK.md`

## Agent / Cursor 使用

- 大改前使用 skill：`grill-with-docs`（对齐需求与词汇）
- 架构审查：`improve-codebase-architecture`
- 不熟悉模块：`zoom-out`
- 禁止 agent 未经确认 `git push --force` 或 `git reset --hard`

## 参考 Skills 来源

项目 `.cursor/skills/` 改编自 `E:\downloadskills\skills-main`（Matt Pocock *Skills For Real Engineers*），并按 COMTRADE 项目裁剪。
