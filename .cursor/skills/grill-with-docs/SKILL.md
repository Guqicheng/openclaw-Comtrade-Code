---
name: grill-with-docs
description: >-
  在改 COMTRADE Viewer 前做需求对齐：对照 CONTEXT.md 与 docs/adr/，逐问逐答，
  并即时更新领域词汇与 ADR。用于新功能、架构变更、里程碑启动前。
---

# Grill with Docs（COMTRADE 项目）

## 何时使用

- 新里程碑（M1/M2）开工前  
- 涉及 `comtrade_parser` 侵入式改动、会话模型、降采样/FFT 行为变更  
- 用户说「继续推进」但未写清验收标准时  

## 流程

1. 阅读根目录 `CONTEXT.md`、`docs/ARCHITECTURE.md`、相关 `docs/adr/*.md`  
2. **一次只问一个问题**，给出你的推荐答案，等用户确认后再问下一个  
3. 若答案在代码里，先查代码再提问  
4. 用户用词与 `CONTEXT.md` 冲突时立即指出  
5. 术语确定后**立刻**更新 `CONTEXT.md`（见 mattpocock `CONTEXT-FORMAT.md` 规则）  
6. 难逆转的权衡写入 `docs/adr/NNNN-slug.md`（见 `ADR-FORMAT`：三条都满足才写）  

## 本仓库必问项（架构优先）

- 改动落在哪一层？是否违反 `docs/ARCHITECTURE.md` 依赖方向？  
- 是否影响 **分析会话** 语义？是否与 ADR-0002 一致？  
- CAAP2008X / 行业同类软件如何做？（避免闭门造车）  
- 验收如何自动化（`pytest` / `check_dev.bat`）？  

## 禁止

- 不要一次抛出 10 个问题  
- 不要把实现细节写进 `CONTEXT.md`  
- 不要在无 ADR 的情况下重做已否决的架构方案  
