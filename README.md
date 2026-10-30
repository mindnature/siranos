# SiranOS · Personal AI Memory and Digital Self

**Two public-alpha interfaces:** a Chrome extension for manual file import (v0.2) and an **agent-installed Google Drive for desktop folder bridge** with local MCP tools (v0.3 alpha).

## Recommended: Codex / WorkBuddy → Drive → Second Brain

The new `bridge/` component runs on the user's computer. Once Google Drive **for desktop** is connected and a synced folder is selected, adding supported files to that Drive folder updates the private local index when Codex/WorkBuddy next calls SiranOS. MCP tools expose evidence search, source inspection and user-approved memory profile — never the entire Drive by default. **No Google developer credentials, LLM API key or server deployment is required for this bridge.**

For the complete setup use **[Drive + MCP install guide](docs/DRIVE-MCP-SETUP.md)** and [agent installer instructions](AGENTS.md).

```sh
node bridge/cli.mjs setup --folder "/path/to/your/Google Drive/SiranOS Inbox"
node bridge/cli.mjs sync
node bridge/cli.mjs integration
```

**Important:** signing in on drive.google.com alone is NOT sufficient in this build. Google Drive for desktop must be signed in and syncing, with a local folder chosen once. True web OAuth login, cloud-native Docs access, ZIP64, large exports and automatic semantic personality modeling are future milestones, not shipped features. See [OAuth product plan](docs/OAUTH-PRODUCT-PLAN.md).

## Existing Chrome extension


**Local-first, evidence-linked memory and digital-self prototype.** SiranOS is a Chrome/Edge Manifest V3 extension that imports *user-selected* chat exports, stores source records locally, identifies reviewable memory candidates, and generates a portable digital-self profile from **human-approved** statements. It uses no remote language model.

> Early alpha (0.2.0): do not assume this is a production-grade 5 GB backup, a live cross-provider sync solution, a verified human personality model, or an autonomous agent.

## What works today

**New in 0.2 (offline evidence workflow)**

- Ask plain-language questions about imported **user-authored** messages. Returns cited, source-linked **extractive evidence** and transparent coverage limits; **no LLM summarization or semantic search**.
- Send a retrieved quote to the **pending memory review** queue, approve or dismiss it manually, and see the approved record reflected in Digital Self. Changing a source invalidates old evidence.
- Stream official ChatGPT `chat.html` and large JSON root arrays, without reading the complete file into a single JS string. Progress and user cancellation are supported. ZIP64 is still not supported.

See [the walkthrough and honest limits](docs/V0.2-QA.md).

- Import recognizable **ChatGPT / Claude / Gemini Takeout / DeepSeek / Grok** exports as JSON or ordinary-size ZIP; plain text/Markdown also works. Export formats vary, so adapters are best effort.
- Preserve recognized original JSON conversation objects in browser IndexedDB, alongside keyword projections and a version record when sources change.
- Find source messages by substring search, inspect exact quoted evidence and message position.
- Extract rule-based candidates from **user-authored** messages only. A candidate is not a fact until manually reviewed; even confirmed claims are not independently verified.
- Group approved statements into **Digital Self** views: decisions, goals, actions (self-reported) and reflections, each with source pointers and an exportable JSON snapshot.
- Explore topic clusters and produce a timestamp-bounded seven-day *evidence* review.
- Optional private Google Drive sync through the official `drive.file` scope. **Cloud sync is off until explicitly enabled**; never share your backup folder publicly.

## Quick start (no Python, server or npm install)

1. Download the repository ZIP and extract it to a permanent folder.
2. Chrome/Edge → extensions → **Developer mode** → **Load unpacked** → select `extension/`.
3. Click the extension toolbar icon to open the SiranOS page. **Do not import sensitive data to test functionality.** Start with `examples/demo-conversations.json` (entirely synthetic).
4. On **Import**, choose the JSON file, acknowledge local/cloud storage conditions, and import.
5. In **Memory Review**, inspect generated candidates and approve or dismiss them. Visit **Digital Self** to see source-linked reviewed statements. For questions, use **向历史提问** and review the original citations before promoting anything to memory.
6. Export Digital Self JSON or AI context JSON for use in your own authorized tools. The extension does **not** automatically connect those tools.

### Optional Google Drive

The distributed `extension/manifest.json` intentionally contains a **placeholder** Chrome OAuth Client ID, not any author's credentials. Offline importing and review do not require OAuth. To enable Google Drive, register your **own** Google Cloud OAuth client for a Chrome extension, replace the placeholder `oauth2.client_id`, confirm your *actual extension ID* in `chrome://extensions`, and reload. The Google API scope is `https://www.googleapis.com/auth/drive.file`. Auth is not enabled by simply cloning this repository. No OAuth secrets or user tokens are stored in GitHub.

If upgrading an earlier SiranOS build, back up the existing browser profile and review [upgrade safety notes](docs/UPGRADE.md). **Do not replace an existing extension in place without checking compatibility**; changing an unpacked extension ID can make its IndexedDB data inaccessible.

## Size limits and known gaps

- **ZIP/ordinary JSON importer** refuses files over 180 MiB, and ZIP64 remains unsupported. The separate streaming path now supports ChatGPT `chat.html` and large **root-array** JSON files with a 64 MiB **per-conversation** safety cap. Multi-gigabyte ZIP archives must still be extracted outside the extension. The extension cannot scan arbitrary preexisting Google Drive folders.
- ZIP imports only recognized chat JSON and **not** the full attachment/media payload. Preserve original ZIP separately for complete backup.
- The plugin cannot automatically read new ChatGPT/Claude/Gemini pages or other AI vendors' account histories. The optional Google Drive feature backs up records **the plugin itself imported**.
- Original-source search uses substrings. The new **offline question mode** uses lightweight lexical overlap to find user quotes, and labels its output as *evidence*, not an AI-generated answer. No local vector DB, LLM synthesis, MCP server or web crawling in this prototype.
- Chrome local storage and Drive files are **not end-to-end encrypted**. Review sensitive and third-party content before importing or syncing.
- Provider formats and message branches vary. Dates, counts, and inferred topics can be approximate; confirm against the source export.

## Design principle

Source data → parsed messages → **unconfirmed** candidates → manual review → source-linked digital-self projection → portable context export. Revoking approval or invalidating the source removes it from current Digital Self projection. The UI intentionally does not claim to have verified actions or to diagnose personality.

## Development

Node.js **22+**, with no npm dependencies:

```bash
npm test
npm run lint
```

The tests cover offline cited Q&A and memory promotion, synthetic streamed ChatGPT HTML / JSON, five provider shapes, synthetic ZIP, content dedup/versioning, user-vs-assistant filtering, memory review, cloud upload mocks, stale evidence, digital-self projection and a multi-gigabyte ZIP guard. CI runs the same suite. Tests do not establish end-to-end success with a real Google account, Windows machine or provider export.

## Repo structure

`extension/` unpacked MV3 Chrome extension; `tests/` synthetic-only fixtures; `examples/` fake chats for onboarding; `docs/` architecture, upgrade and roadmap; `.github/workflows/` CI.

Contributions: report reproducible issues with **redacted or fake** files; do not attach private conversation dumps, authorization tokens, personal histories or third-party records. For security considerations, see [SECURITY.md](SECURITY.md).

Source under MIT license. Personal data belongs to its owner; software licensing does not grant rights over uploaded content.
