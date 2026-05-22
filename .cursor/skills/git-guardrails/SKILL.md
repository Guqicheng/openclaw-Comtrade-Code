---
name: git-guardrails
description: >-
  在本仓库执行 git 时的安全约束。远程为 Guqicheng/openclaw-Comtrade-Code，
  默认分支 dev。用于 agent 即将运行 git 命令时。
---

# Git Guardrails（openclaw-Comtrade-Code）

## 仓库

- **origin**: `https://github.com/Guqicheng/openclaw-Comtrade-Code.git`  
- **开发分支**: `dev`（跟踪 `origin/dev`）  
- **稳定分支**: `main`  

## Agent 禁止（除非用户明确要求）

- `git push --force`  
- `git reset --hard`  
- `git clean -fd`  
- `git branch -D`  
- 向 `main` 直接 force push  

## Agent 允许（需用户要求或常规流程）

- `git status` / `diff` / `log`  
- 在 `feat/*` 分支提交  
- `git push -u origin feat/...`  
- 提醒用户开 PR：`feat/*` → `dev`  

## 提交前

- 确认 `user.name` 不是 `yourname`  
- 不提交 `venv/`、`uploads/`、大二进制  
- 架构/行为变更检查是否需更新 `docs/adr/` 或 `CONTEXT.md`  

## 参考

上游脚本：`E:\downloadskills\skills-main\skills\misc\git-guardrails-claude-code\scripts\block-dangerous-git.sh`
