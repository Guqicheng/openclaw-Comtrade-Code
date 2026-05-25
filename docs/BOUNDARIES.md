# 项目一：COMTRADE 开发 — 边界

本仓库即 **项目一**（`test1.2`）。完整边界见工作区：

**`E:\开发项目\docs\BOUNDARIES.md`**

## 本仓库负责

- COMTRADE 解析、`backend/` API、`web/` 展示与测量工具
- 对标 CAAP2008X 的业务功能（见 `项目开发计划.md`）

## 本仓库不负责

- OpenClaw / ClaudeCode 的安装与 Gateway
- 多 Agent 分工/并行编排（由 `hermes-platform` 完成）
- 修改 `hermes-platform` 源码

## 被平台调用时

- 路径：`E:\开发项目\test1.2`（WSL：`/mnt/e/开发项目/test1.2`）
- 须遵守任务契约：只读 / 可写（见平台 `docs/REQUIREMENTS.md`）
- 架构分层见本仓库 `ARCHITECTURE.md`，禁止跨层依赖

## 相关 ADR

- `docs/adr/0001` — 分层与仓库治理
- `docs/adr/0002` — `analysis_id` 替代全局 reader（M1a 已实现）
