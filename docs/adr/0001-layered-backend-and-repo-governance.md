# 分层后端与仓库治理 upfront

COMTRADE Viewer 采用固定五层依赖（web → routes → services → analysis → comtrade_parser），并在开项阶段建立 `CONTEXT.md`、`docs/ARCHITECTURE.md`、路线图与 CONTRIBUTING，避免多智能体/多人协作时 freestyle 改代码。治理流程参考 Matt Pocock skills 仓库（grill-with-docs、improve-codebase-architecture、git-guardrails）。
