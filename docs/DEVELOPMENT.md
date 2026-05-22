# 开发流程

## 仓库信息

| 项 | 值 |
|----|-----|
| GitHub | [Guqicheng/openclaw-Comtrade-Code](https://github.com/Guqicheng/openclaw-Comtrade-Code) |
| remote `origin` (fetch/push) | `https://github.com/Guqicheng/openclaw-Comtrade-Code.git` |
| 账户 | Guqicheng |
| 本地路径 | `E:\开发项目\test1.2` |

## 分支

| 分支 | 用途 |
|------|------|
| `main` | 稳定基线（test1.2 标准版） |
| `dev` | 日常开发，跟踪 `origin/dev` |
| `feat/*` | 单功能分支，小步 PR |

当前默认在 **`dev`** 上开发。

## Git 用户配置（必改）

若仍为占位符，在项目目录执行：

```powershell
git config user.name "Guqicheng"
git config user.email "你的GitHub邮箱或 noreply 地址"
```

查看 GitHub 提供的 noreply 邮箱：GitHub → Settings → Emails。

## 日常命令

```powershell
cd E:\test1.2
git status
git pull origin dev
git checkout -b feat/简短描述
# ... 开发 ...
git add -A
git commit -m "fix: 简短说明"
git push -u origin feat/简短描述
```

在 GitHub 上开 PR：`feat/*` → `dev`；发布时 `dev` → `main`。

## 提交信息

- `feat:` 新功能  
- `fix:` 修复  
- `docs:` 文档  
- `refactor:` 重构（不改行为）  
- `test:` 测试  
- `chore:` 工具/依赖

## 本地运行

```powershell
.\start_dev.bat
# 或
.\check_dev.bat
```

浏览器：`http://localhost:7000`

## 提交前检查（推荐）

Windows 商店版 Python 常把脚本装到不在 PATH 的目录，请用 **`python -m pre_commit`**：

```powershell
pip install pre-commit
python -m pre_commit install
python -m pre_commit run --all-files
```

或双击：`setup_precommit.bat`

若已把 Scripts 加入 PATH，也可直接运行 `pre-commit`。

### 网络超时（GitHub / PyPI）

若 `git push` 或 `pre-commit` 报 `Could not connect` / `Read timed out`：

1. 检查代理/VPN，或换手机热点重试  
2. 临时跳过钩子提交文档：`git commit --no-verify -m "..."`  
3. 恢复 Python 检查：在 `.pre-commit-config.yaml` 取消注释 ruff 段（见文件顶部说明）

```powershell
git config --global http.postBuffer 524288000
git config --global http.lowSpeedLimit 0
git config --global http.lowSpeedTime 999999
```

## 文档与 Skills

- 领域词汇：`/CONTEXT.md`  
- 架构：`docs/ARCHITECTURE.md`  
- 路线图：`docs/ROADMAP.md`（与 `docs/项目开发计划.md` 同步）  
- Agent Skills：`.cursor/skills/`（改编自 [mattpocock/skills](https://github.com/mattpocock/skills)）
