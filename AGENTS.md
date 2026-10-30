# SiranOS installing assistant guide (Codex / WorkBuddy)

**Default goal: private local-first installation for any user.** Do not ask for Google credentials and do not copy user content to GitHub, a public issue, or a model prompt.

## New user install

1. Verify Node.js >=22, install/copy this repository to a permanent folder. Read `docs/LOCAL-FIRST-SETUP.md` and `SECURITY.md`.
2. Run `node bridge/cli.mjs init --frequency weekly` (ask for a custom `--root` only if necessary). This is safe to repeat in the **same** existing workspace, but refuses to replace an unrelated configured source.
3. Run `node bridge/cli.mjs tick` with synthetic fixtures first. Show the generated `Documents/SiranOS` folder and explain `01_资料收件箱`.
4. Ask whether the user wants a scheduled check. Only after approval run `node bridge/cli.mjs schedule-install`. The task checks every morning at 09:00 local time; reports are weekly/monthly/manual. Run `schedule-preview` first if needed.
5. Run `node bridge/cli.mjs integration`. Add the printed local MCP configuration to Codex/WorkBuddy. For WorkBuddy, **merge** with pre-existing `mcpServers`; never overwrite the user's config wholesale.
6. Verify `siranos_status`, `siranos_search`, `siranos_second_brain` and `siranos_workspace_update` in the target assistant. Explain that word/trigram retrieval is not full reasoning and citations refer to original evidence.
7. Tell the user that long-term memories require `node bridge/cli.mjs memories` followed by `approve <id>`. The system must never turn unreviewed claims into stable user profile facts.

## Upgrades and optional cloud

If `~/.siranos` already belongs to a Drive for desktop or direct Google OAuth installation, local `init` **must refuse** to replace that configured source. Use a separate `SIRANOS_HOME` or a deliberate migration plan. The 0.4 Google OAuth developer preview is optional and unverified for broad public OAuth distribution. Never require a Google account for local mode. Do not make the user supply any API keys, OAuth tokens or private files to ChatGPT or GitHub.

## Privacy and correctness

- No real user's identity or chat transcript is bundled with this repository. Test with `examples/drive-inbox-demo/`.
- Do not claim actual background scheduling until the real OS reports that task registration succeeded.
- Local reports are evidenced snapshots, not diagnostic personalities or externally verified events.
- Never upload personal data, generated Markdown, secrets or any local database to a public repository. A successful CI run is not a real device end-to-end test.
