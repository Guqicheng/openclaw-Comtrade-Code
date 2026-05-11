#!/bin/bash
# COMTRADE Viewer - WSL2 GitHub 自动推送脚本
# 用法: bash git-push-wsl.sh "提交信息"

set -e

# 项目路径（WSL2 访问 Windows 文件系统）
PROJECT="/mnt/e/BaiduNetdiskDownload/test1.2"

# 提交信息
MSG="$*"
if [ -z "$MSG" ]; then
    MSG="自动提交 $(date '+%Y-%m-%d %H:%M')"
fi

echo "📁 项目: $PROJECT"
cd "$PROJECT"

echo "🔍 当前分支: $(git branch --show-current)"
echo "📝 提交信息: $MSG"

# 添加并提交
git add -A
git commit -m "$MSG"

# 推送到 GitHub（如果你配置了远程仓库）
echo "🚀 推送到 GitHub..."
git push 2>/dev/null && echo "✅ 推送成功" || echo "⚠️  推送失败（可能未配置远程仓库）"

echo ""
git status
