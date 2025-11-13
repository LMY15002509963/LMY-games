@echo off
echo 🚀 球球大作战游戏部署脚本
echo ================================

echo 📋 检查Git状态...
git status

echo.
echo 📤 推送到远程仓库...

rem 推送代码到GitHub
git push origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ 代码已成功推送到GitHub!
    echo.
    echo 🌐 部署选项：
    echo 1. Vercel: 访问 https://vercel.com 并导入仓库
    echo 2. GitHub Pages: 在仓库设置中启用Pages功能  
    echo 3. Heroku: 使用 'heroku create' 然后推送
    echo.
    echo 📖 详细说明请参考 DEPLOY.md 文件
) else (
    echo.
    echo ❌ 推送失败，请检查网络连接和权限设置
    echo 💡 您可以手动运行: git push origin main
)

pause