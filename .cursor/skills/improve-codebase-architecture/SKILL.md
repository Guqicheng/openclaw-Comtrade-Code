---
name: improve-codebase-architecture
description: >-
  在 COMTRADE Viewer 中查找架构摩擦：浅模块、跨层耦合、不可测试接口。
  对照 CONTEXT.md 与 docs/adr/。用于 refactor、M1 架构债、评审前。
---

# Improve Codebase Architecture（COMTRADE）

## 词汇（报告里统一使用）

- **Module**：有接口与实现的单元（文件、包、路由组）  
- **Interface**：调用方必须知道的一切（类型、错误、顺序、会话 ID）  
- **Depth**：接口小、行为多 = deep；接口≈实现 = shallow  
- **Seam**：可替换实现的位置（如 parser 适配、analysis_id 缓存）  

## 探索顺序

1. `CONTEXT.md` + `docs/adr/`  
2. 按层检查：`web` → `*_routes` → `services` → `analysis` → `comtrade_parser`  
3. 删除测试：删掉某模块后复杂度是消失还是散落？  

## 本仓库高优先级检查

| 区域 | 典型问题 |
|------|----------|
| `analysis_routes.py` | 全局 `_current_reader`（ADR-0002 待落地） |
| `routes.py` `downsample` | 无抗混叠，FFT 失真风险 |
| `comtradecopy.py` | 侵入式 fork、同名 property 覆盖 |
| `web/*.js` | 全局函数、测量与 Plotly 事件耦合 |
| `requirements.txt` | numpy 未声明导致 FFT 静默失败 |

## 输出

向用户呈现**候选列表**（问题 / 建议 / 强度 Strong|Worth exploring|Speculative），使用 `CONTEXT.md` 术语。

用户选定一项后，进入 grilling（可转 `grill-with-docs`），必要时新增 ADR。

## 不要

- 未读 ADR-0001/0002 就建议恢复全局 reader  
- 把 UI 换皮当作架构改进  
