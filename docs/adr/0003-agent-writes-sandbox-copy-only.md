# 经多 Agent 平台修改时，ClaudeCode 只写沙箱副本

平台侧 ADR-0003 的镜像说明：当任务由项目二（hermes-platform）发起且 Worker 为 ClaudeCode 时，代码改动发生在 WSL 副本 `~/ai-sandbox/workspace/claudeCode/test1.2`，**不**视为已合并到本仓库，直到人工/脚本合并至 `E:\开发项目\test1.2` 并 `git commit`。

本仓库 Git 历史以本地真源为准。
