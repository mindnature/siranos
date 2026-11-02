# SiranOS 0.5.1 Windows 一键安装（测试版）

**目标：下载 ZIP → 解压全部 → 双击 `Install-SiranOS.cmd` → 放入文件 → 在 Codex 中调用。**

安装器在当前 Windows 用户权限下运行，不要求管理员权限、不写注册表全局环境变量、无需 Docker、Git 或 Google 登录。它不是签名 EXE；请先确认来自本项目仓库，查看源码后再运行。

## 安装器做什么

1. 检查 ZIP 是否已完整解压且包含 `bridge/cli.mjs`。
2. 检查 Node.js 是否满足 >=22.13；否则从官方 `nodejs.org` 下载 Node.js 22.16.0 的 Windows 便携 ZIP，并与官方发布的固定 SHA-256 比对。下载失败时终止，不宣称已成功。
3. 将 SiranOS 程序安装到 `%LOCALAPPDATA%\Programs\SiranOS\App-0.5.1`；再次运行不会覆盖已有受管理的程序目录。
4. 在 `%USERPROFILE%\Documents\SiranOS` 初始化本地知识目录；如已有未知 SiranOS 内容则使用不同的 `SiranOS-New` 路径，避免误覆盖。SQLite/配置使用隔离的数据目录 `%LOCALAPPDATA%\SiranOS\state-0.5.1`。
5. 执行一次 `tick` 并显示工作区状态。
6. 如果检测到 Codex CLI 且没有 `siranos` 同名 MCP，执行 `codex mcp add siranos --env SIRANOS_HOME=<隔离数据目录> -- <node.exe绝对路径> <bridge/mcp.mjs绝对路径>`。已有同名服务不会覆盖，需要用户自行核对。
7. 询问用户是否启用每天09:00本机任务计划程序检查；仅当输入 **YES** 时才注册。每周/月生成报告仍由知识库的 frequency 配置决定。
8. 输出安装位置、知识目录、MCP/定时任务状态，并提供打开知识目录的选项。

## 安装后日常使用

将聊天导出或笔记放入 `01_资料收件箱`。询问 Codex：“使用 `siranos_status` 检查知识库，再用 `siranos_search` 回答我以前讨论过什么并引用来源。”需要长期保存的事实必须经人工审核，不能自动认可模型推测。

离线导入支持 TXT、MD、CSV、部分 JSON/JSONL、HTML、DOCX；PDF 需要另装 `pdftotext`。单文件48MiB上限，不能直接导入整个5GB ZIP64。

## 边界与安全

- 这是 **Windows 10/11 Alpha 双击脚本安装包**，未做真实 Windows UI、杀毒兼容或系统任务调度器 E2E 验证；GitHub CI 的静态脚本检查不等于 Windows 测试。
- 未检测到 Codex CLI 时，安装器只完成本地第二大脑初始化，不会谎称 MCP 已连接。
- 程序代码与个人数据分离；卸载程序目录不等于删除 SQLite/知识文件；不要通过删除目录来当作完整卸载或备份。
- 安装器不会上传个人数据到仓库，也不会修改 Google 授权。云盘模式保持可选。
- 日后改成每月复盘：在专用数据目录环境变量下运行 `node bridge/cli.mjs frequency monthly`，或让已连接的 Codex 协助。
