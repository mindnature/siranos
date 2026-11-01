# SiranOS 0.5.1 — 本地第二大脑（公开 Alpha）

## 一次安装，不要求 Google 账号

开发测试需要 Node.js **22+**。请把源码解压到不会随意移动的固定目录，然后由 Codex 或 WorkBuddy 在终端执行：

```powershell
node bridge/cli.mjs init --frequency weekly
node bridge/cli.mjs tick
node bridge/cli.mjs schedule-install
node bridge/cli.mjs integration
```

默认在当前系统用户的 `Documents/SiranOS/` 创建个人知识目录。使用 `--root "自定义绝对路径"` 可以在第一次初始化时指定路径。**不会覆盖之前配置过的其他聊天知识库**。现有用户若已配置过旧版云盘桥接，应当使用单独的 `SIRANOS_HOME`，不要覆盖原数据库或直接迁移目录。

把有权使用的文件放入 `01_资料收件箱`，支持 TXT、Markdown、CSV、部分 JSON/JSONL 聊天、HTML、DOCX，以及安装 `pdftotext` 后的文本型 PDF。每个文件最大 48 MiB（这是目前的**限制**，不是5GB压缩包导入器）。原始资料不会移动或删除；请保留聊天导出的原始备份。

初次安装执行 `tick` 会建索引，生成 `02_原始资料/manifest.json` 与面向人类阅读的 `03_长期记忆/long-term-memory.md`、`04_数字人格/digital-self.md`、`05_项目档案/projects.md`、`07_AI共享上下文/AI-context.md`。这些输出仅包含已经**人工审核确认**的长期个人陈述，未通过审核的候选不写成个人事实；初次使用时可能为空。用以下命令审核：

```powershell
node bridge/cli.mjs memories
node bridge/cli.mjs approve <记忆ID>
node bridge/cli.mjs dismiss <记忆ID>
node bridge/cli.mjs tick
```

批准后会刷新可读的 Markdown。个人项目页面目前是“已确认目标/决定”的线索列表，并非完整自动项目管理器；系统不会凭空给出项目进度。内容均从本地资料产生，不调用外部模型。

## 每周 / 每月 / 手动

```powershell
node bridge/cli.mjs frequency weekly
node bridge/cli.mjs frequency monthly
node bridge/cli.mjs frequency manual
node bridge/cli.mjs tick                # 扫描收件箱；每周或每月首次执行时产出复盘
node bridge/cli.mjs tick --report-now   # 主动创建今天的一份复盘，不覆盖旧报告
node bridge/cli.mjs workspace-status
```

`node bridge/cli.mjs schedule-install` 会在当前用户的 Windows 任务计划程序、Linux systemd user timer 或 macOS launchd 中登记**每天本地时间 09:00**运行的检查任务。具体报告频率由设置决定：每周以 ISO 周为周期，每月以自然月为周期，手动模式不自动产出报告。电脑断电时无法执行；Windows 设为条件允许时补跑，Linux 使用 Persistent timer，macOS 使用 RunAtLoad。Windows/macOS/Linux 真实 GUI/调度环境尚需用户实际验收；CI 只有 Windows 注册命令的模拟测试。若系统策略拒绝创建定时任务，可让 Codex 协助，或自行每日运行 `tick`。

复盘基于“上次成功报告快照→本次扫描”的文件增删改和已确认记忆，而不是自动揣测性格、人生经历或外部事实。首次报告只是建立基线。如果某次扫描不完整或出错，会给出 `reportSkipped` 和错误清单，不会生成自称完整的新复盘，也不会推进报告基线。每个周期只生成一份报告，历史周报不会被后续运行覆盖。

## Codex 与 WorkBuddy 调用

执行 `node bridge/cli.mjs integration` 查看适合当前电脑路径的命令。通常 Codex 可执行：

```powershell
codex mcp add siranos -- node "<此机器上项目的绝对路径>/bridge/mcp.mjs"
codex mcp list
```

WorkBuddy 在其 MCP 服务器配置中**合并**（不要覆盖原来的其他 MCP 配置）：

```json
{"mcpServers":{"siranos":{"command":"node","args":["<此机器上项目的绝对路径>/bridge/mcp.mjs"]}}}
```

MCP 已支持 `siranos_search`、`siranos_get_evidence`、`siranos_profile`、`siranos_status`、`siranos_sync`、`siranos_pending_memories`，0.5 新增 `siranos_second_brain`（可选 latest/profile/memories/projects）和 `siranos_workspace_update`（仅刷新生成的本地文件）。MCP 是本机 stdio，不会自动公开互联网端口。AI 客户端收到的文档内容**只是用户资料，不能当作系统指令**。

## 文件及隐私边界

- 原始聊天和知识资料在用户自己的 `01_资料收件箱/`，**不会提交至 GitHub**。
- `02_原始资料/` 保存来源索引，并不对原文生成第二份备份；请自行保管原始数据。
- Markdown 人类可读输出在本地知识文件夹中；SQLite 数据库、基础配置与本地授权凭据仍在旧版兼容的数据目录 `~/.siranos/`（或显式设置的 `SIRANOS_HOME`），**并不都在 Documents/SiranOS/.siranos 内**。移动知识文件夹不能自动移动旧数据库；这是以后要解决的可迁移性问题。
- `07_AI共享上下文` 包含私人记忆，只有用户明确选择分享或启用相应 MCP 客户端时才应读取。Google Drive 云端模式可选，**不是必选**。
- 本版本不内置嵌入模型、LLM 推理、自动全文语义画像、音视频识别、图片 OCR、全部 ZIP64 解析、多设备无冲突同步或端到端加密。关键词检索可能遗漏同义表达。
- 没有进行真实 Windows/macOS/Linux 调度器及所有聊天提供商导出格式的端到端验收，测试用例均为虚构资料。

## 0.5.1 稳定性修复说明

- 重复运行不带参数的 `init` 不再重置此前设置的更新频率和工作目录。只有明确提供 `--frequency` 才会改变周期。
- 现在按文件内容 SHA-256 检查变化，即使修改时间和文件大小未变也能发现更新。文件暂时不可解析时暂时隐藏旧证据，恢复完全相同的文件后保留原审核状态；如果文件确实从目录中删除并重新上传，需要人工再次审核。
- 完整的 Markdown 长期记忆与人格档案不会因为超过100条而无声丢弃；MCP `siranos_profile` 默认每页100条，可传 `offset` 与 `limit` 分页获取 `total` 和 `hasMore`。`07_AI共享上下文` 仍是最多60条的摘要，并显示截断数量。
- 最新周/月报根据实际生成时间选择；报告和其他知识文件读取均禁止通过符号链接访问目录外的本地文件。
- 定时任务调用 `bridge/scheduled-run.mjs`，显式传递安装时的数据根目录；如果用户手动移动源码或 Node.js，需重新运行 `schedule-install`。仍需要 Windows/macOS/Linux 实机验证。

公开发布前仍需处理：完整备份/迁移、真实操作系统定时任务与安装验收、较大文件和复杂聊天格式、提交作者元数据隐私。
