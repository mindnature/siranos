# Installing SiranOS for a user (Codex / WorkBuddy agents)

This is a **public, generic** personal-knowledge tool. Never include the developer's own private files, chat exports or OAuth credentials in a user's setup. No data belongs in the Git repository.

## First-run procedure

1. Read `docs/DRIVE-MCP-SETUP.md`, `SECURITY.md` and `README.md`.
2. Ensure Node.js >=22 is available. Do not modify or replace other installed LifeOS extensions.
3. Ask the user to sign in to **Google Drive for desktop**. This is a separate Google app installed on their PC; it gives a folder path. **Do not ask for a Google password or token.**
4. Let the user choose/create a dedicated **Drive-synced folder** such as `SiranOS Inbox` using Drive for desktop. Prefer a local mirror (fully synced) for reliable indexing. Do not automatically scan the user's entire Drive.
5. Run `node bridge/cli.mjs setup --folder "<user-selected synced folder path>"` then `node bridge/cli.mjs sync`. Note errors, unsupported formats and files skipped for size; confirm the file count.
6. Show `node bridge/cli.mjs integration`. For Codex, register the local stdio MCP using `codex mcp add siranos -- node "<absolute path>/bridge/mcp.mjs"`. For WorkBuddy, **merge**, do not replace, `mcpServers.siranos` into `~/.workbuddy/mcp.json` or configure via the UI.
7. Restart/reload the AI client and confirm the `siranos_status`, `siranos_sync` and `siranos_search` tools respond. Test with `examples/drive-inbox-demo` **before** private files.
8. Explain that new or changed synced files are re-indexed on MCP calls (at most once per minute per running process). `siranos_profile` contains **only user-approved personal statements**. The user can review pending candidates via `node bridge/cli.mjs memories` and `approve <id>`.

## Safety

- The MCP server is read-only with respect to uploaded Drive files. It writes only to local `~/.siranos` SQLite index.
- Do not copy the source folder into GitHub, cloud logs, or an LLM prompt wholesale. Only return the requested evidence and cite its source path.
- Do not suggest `codex mcp login siranos` for this **local stdio** MCP server; that command applies to OAuth-capable remote endpoints, not Google Drive for desktop.
- Never claim browser-only Google sign-in will directly work; current beta needs Drive for desktop sync. Direct web OAuth, Google Docs native export, robust >48MiB files, fully automated semantic profiles and production privacy audits are NOT shipped.
