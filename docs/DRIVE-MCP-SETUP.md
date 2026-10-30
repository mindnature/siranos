# SiranOS: install once, put files in Drive, recall them through AI

## User experience

1. A coding assistant (Codex or WorkBuddy) installs SiranOS on the user's own computer.
2. User installs/signs in to **Google Drive for desktop** (Google's official app) with their own account. It exposes a local Windows/macOS folder or virtual drive. They choose a single dedicated `SiranOS Inbox` folder. Nothing outside that directory is scanned.
3. The assistant configures that folder **once** (`node bridge/cli.mjs setup --folder "..."`) and registers SiranOS as a **local stdio MCP server**.
4. Thereafter the user uploads text/Markdown/JSON/chat HTML/Word documents (DOCX) to the chosen Drive folder, or puts files there locally. Drive for desktop synchronizes them to the computer; Google decides sync timing.
5. In Codex/WorkBuddy, the user asks: “Search my SiranOS notes about community gardens and cite the source.” The AI client invokes `siranos_search`, receives indexed text excerpts with stable evidence IDs and source names, and may call `siranos_get_evidence`. The assistant, not SiranOS, writes the natural-language answer.
6. SiranOS also detects **unverified** goal/decision/preference statements from imported user chat messages. These appear as pending. The user approves with `node bridge/cli.mjs memories` → `approve <id>`; only approved, valid statements are exposed via `siranos_profile`.

## Installation on Windows / macOS / Linux

Requires Node.js 22+ and access to the Google Drive for desktop-synchronized folder. No npm dependencies or personal Google Cloud project.

```powershell
# In the SiranOS repository directory:
node bridge/cli.mjs setup --folder "G:\\My Drive\\SiranOS Inbox"
node bridge/cli.mjs sync
node bridge/cli.mjs status
node bridge/cli.mjs integration
```

The example `G:` path is **not universal**. The installer must discover/ask for the user's actual synced directory. Google Drive for desktop supports both streaming and mirroring. Mirroring is recommended for long-running local indexing; streaming requires the app to be running and online when files are not cached. See [Google's explanation](https://support.google.com/drive/answer/13401938).

### Codex

```powershell
codex mcp add siranos -- node "C:\\path\\to\\siranos\\bridge\\mcp.mjs"
codex mcp list
```

Restart Codex and ask: “Use the siranos_status tool and tell me how many documents are indexed.” This config is for **local stdio**; do not use `codex mcp login` for it.

### WorkBuddy

In the **MCP server** configuration UI, merge the following server into the current `mcpServers` object (do **not** overwrite other MCP servers):

```json
{"mcpServers":{"siranos":{"command":"node","args":["C:\\path\\to\\siranos\\bridge\\mcp.mjs"]}}}
```

Alternatively use the WorkBuddy user-level MCP configuration file `~/.workbuddy/mcp.json`; consult the installed client's supported settings format/version. Restart WorkBuddy and test `siranos_status`.

## Supported formats and limits

- TXT, Markdown, CSV, JSON/JSONL (common ChatGPT/Claude-style conversation records), basic HTML and DOCX.
- PDF **only if** a local Poppler `pdftotext` executable is installed. Scanned/image PDFs are not OCRed. Native Google Docs, Sheets and Slides appear as `.gdoc/.gsheet/.gslides` pointers in Drive for desktop and **are not parsed**. Export these to PDF/DOCX/TXT first, or wait for the direct Drive API integration.
- Each file up to **48MiB** (unsupported larger files are reported, not silently claimed imported); up to 20k files; batch archives (.zip, including ZIP64) are not supported by this bridge. Extract them to supported files first.
- Index refresh occurs at the next MCP query and no more than once per minute per running MCP process; not a background cloud service. The local SQLite index is under `~/.siranos` and is not automatically cross-device synchronized.
- No embedding model, LLM API or Google OAuth key. Keyword/trigram search can miss paraphrases, so results **must not** be described as complete semantic reasoning. AI assistants can summarize the returned evidence but must not invent absent facts.
- Candidate memories are only heuristics; approving a statement means the user accepts its wording, not that the underlying event was independently verified.

## What it does NOT do

This release does **not** let someone simply authorize the Google Drive website in a browser and have SiranOS directly scan cloud-native documents. That requires publisher-owned OAuth credentials, Google consent-screen configuration/verification, a file-picker or appropriate reviewed scopes, and Drive API incremental syncing. It is the intended production experience, **not** a shipped feature. See `docs/OAUTH-PRODUCT-PLAN.md`.

## Troubleshooting

- `Source folder not found`: Google Drive for desktop is not running, or the streamed-drive path changed; check it in File Explorer/Finder and repeat `setup`.
- Zero indexed files: check the selected folder, offline sync state, file formats and `sync.errors`.
- No profile entries: the system requires manual review; run `memories` and `approve`.
- Native Google Docs: export copies to the supported formats. Keep originals in Drive for backup.
- Search doesn't include new file yet: run `node bridge/cli.mjs sync`, or invoke `siranos_sync` in Codex/WorkBuddy.
