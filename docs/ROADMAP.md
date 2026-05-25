# 路线图

> 详细功能表见 [`项目开发计划.md`](./项目开发计划.md)。本文件定义**里程碑与架构门禁**。

> 工作区阶段定义见 `E:\开发项目\docs\FRAMEWORK.md`。

## M0 — 工程治理（当前）

| 项 | 状态 |
|----|------|
| Git + `origin` 指向 GitHub | ✅ |
| `CONTEXT.md` + `docs/ARCHITECTURE.md` | ✅ |
| `docs/DEVELOPMENT.md` + `docs/CONTRIBUTING.md` | ✅ |
| ADR + 项目 Cursor Skills | ✅ |
| Git `user.name` / `user.email` 改为真实值 | ⏳ 需你确认邮箱 |
| `pre-commit` 本地钩子 | ✅ 配置已加，需 `pre-commit install` |

**验收**：任意协作者仅凭文档能说明分层、分支流程、领域词汇。

## M1 — 架构债（P0/P1，不改 UI 大改）

来源：Hermes 只读诊断 + 架构审查。

1. `requirements.txt` 声明 `numpy`；`app.spec` 增加 `hiddenimports`
2. `_current_reader` → 按 `analysis_id` 会话（ADR-0002）
3. Flask `logging` 到文件
4. `downsample` 文档化或加抗混叠预滤波（ADR-0003 可选）

**验收**：`pytest` 覆盖 `analysis.py` 核心函数；并发上传不串数据。

## M2 — 对标 CAAP 核心补齐

见 `项目开发计划.md` 第一阶段：触发点、波形叠加、导出 PNG/CSV。

**门禁**：合并前填写「CAAP 对标结论」于 PR。

## M3 — 分析深化 + 前端模块化

序分量、向量图等 + `web/` JS 按模块拆分。

---

## 行业对标节奏

每个里程碑**开始前** 30 分钟：

- 查 CAAP2008X / 同类录波软件该能力如何做
- 记录到 PR 或 `docs/adr/`（若决策难逆转）

避免仅在 AI 对话里对齐、却不落文档。
