# 架构说明 — openclaw-Comtrade-Code

> 远程：`https://github.com/Guqicheng/openclaw-Comtrade-Code.git`
> 默认开发分支：`dev`

## 设计原则

1. **每层有边界**：调用方向固定，禁止反向依赖。
2. **每模块有职责**：出问题能定位到目录/文件。
3. **每次调用可预期**：API 输入输出、错误码、会话语义在文档中写清。

## 分层（依赖只能向下）

```text
┌─────────────────────────────────────────┐
│  web/          展示与交互（Plotly、UI）   │
└──────────────────┬──────────────────────┘
                   │ HTTP JSON
┌──────────────────▼──────────────────────┐
│  backend/routes.py, analysis_routes.py     │  HTTP 适配层
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  backend/services.py                     │  应用服务（上传、解析编排）
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  backend/analysis.py                     │  领域分析（RMS/FFT/峰值/相角差）
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  comtrade_parser/                        │  COMTRADE 解析（cfg/dat → reader）
└─────────────────────────────────────────┘
```

| 层 | 目录 | 职责 | 禁止 |
|----|------|------|------|
| 展示 | `web/` | 渲染、用户操作、调用 REST | 直接访问 parser；业务计算 |
| 适配 | `backend/*_routes.py` | 路由、参数校验、HTTP 状态码 | 复杂算法；直接改 parser 内部 |
| 服务 | `backend/services.py` | 保存文件、调用 parser、返回 DTO | 全局可变会话状态（目标态） |
| 分析 | `backend/analysis.py` | 数值分析纯逻辑 | 依赖 Flask request |
| 解析 | `comtrade_parser/` | 读 COMTRADE、暴露 reader/metadata | 依赖 Flask、前端 |

## 模块契约（摘要）

### 上传与波形 `routes.py`

- **输入**：multipart cfg/dat
- **输出**：通道元数据、降采样后的波形序列
- **错误**：400 参数；500 解析失败（目标：记录日志）

### 分析 API `analysis_routes.py`

- **输入**：分析参数（通道、时间窗等）
- **输出**：RMS / 峰值 / FFT / 相角差 JSON
- **分析会话**：上传返回 `analysisId`，分析 API 须携带该字段（见 ADR-0002、`session_store.py`）

### 解析 `comtrade_parser/parser.py`

- **输入**：文件路径
- **输出**：`parse_metadata()` 等稳定接口
- **注意**：`comtradecopy.py` 为定制 fork，升级上游需单独评估

## 与 Hermes 多智能体平台的关系

- 本仓库是**业务层**，编排层为 `E:\开发项目\hermes-platform`（GitHub: `hermes-multi-agent-platform`）。
- 平台通过 `TARGET_PROJECT_WIN=E:\开发项目\test1.2` 做只读诊断或受控修改。
- 三方边界总表：`E:\开发项目\docs\BOUNDARIES.md`；摘要：`docs/BOUNDARIES.md`。
- 智能体改动必须遵守本文件分层与 `docs/CONTRIBUTING.md`。
- EchoBird 等**工具层**可协助安装 OpenClaw/Claude，**不**替代平台编排。

## 行业对标检查点

每个里程碑合并到 `dev` 前：

1. 对照 CAAP2008X：该功能是否已有行业默认交互？
2. 对照录波/电力软件常见做法：会话、导出、触发线如何建模？
3. 若与 ADR 冲突，先更新 ADR 再改代码。
