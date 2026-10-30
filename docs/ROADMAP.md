# SiranOS roadmap — local-first first

## 0.5 — Local second brain (alpha implementation)

- [x] Create readable private knowledge workspace on first setup.
- [x] Dedicated inbox, source manifest, approved-memory Markdown, digital-self summary, project clues, minimal AI context.
- [x] Reuse local SQLite retrieval and human memory review; invalidate removed or modified source evidence.
- [x] Weekly/monthly/manual *evidence snapshot* reports, idempotent per time period and only after successful scans.
- [x] Optional OS user-level scheduled daily check (Windows Task Scheduler, Linux systemd-user timer, macOS launchd; real device E2E pending).
- [x] Existing MCP tools plus second-brain report/summary retrieval and local workspace updates.
- [ ] Production installer and real Windows/macOS/Linux schedule tests.
- [ ] Move SQLite index into a portable workspace with explicit migration and backup/restore.
- [ ] Robust extraction of multi-gigabyte chats, scanned PDFs and rich attachments.
- [ ] User-controlled optional LLM analysis with reviewable proposals and no silent model calls.
- [ ] Periodic comparison of values/decisions with explicit supersession and user validation.
- [ ] Explicitly scoped privacy policy, encryption/permissions and multi-device conflict handling.

## Optional cloud modules

The existing Google Drive for desktop and direct OAuth developer preview are **not** required for local mode. OAuth remains publisher-dependent and public distribution is unverified. Keep this layer separate from the offline core.

# Roadmap

### 0.4 direct Google Drive alpha

- [x] Local browser OAuth authorization-code + PKCE / token refresh (mock tested)
- [x] Read-only Google Drive v3 folder/subfolder listing with paging, selected-folder validation, incremental cache and native Docs/Sheets export (mock tested)
- [x] MCP refresh-on-call and partial-sync warning
- [ ] Publisher-owned verified Google OAuth app, usable by external users without developer setup
- [ ] Narrower Picker-based per-file grant without restricted broad Drive scope
- [ ] Full Google Drive changes feed, retries and always-on background sync
- [ ] Real Windows Google account and WorkBuddy/Codex E2E tests


- [x] Local multi-provider JSON import (best effort)
- [x] Original-source hash, version history and evidence-linked keyword retrieval
- [x] Human-reviewed memory candidates; source-stale detection
- [x] Digital-self view and portable, compact context JSON
- [x] Optional Google Drive sync of imported records; synthetic CI tests
- [ ] Browser E2E tests with real Chrome extension runtime
- [x] Stream supported ChatGPT chat.html / JSON-root-array files with per-conversation bounds; synthetic tests
- [ ] Streaming ZIP64 and fully validated multi-GB exports
- [x] Cursor-based offline evidence scanning without loading all stored conversations at once
- [x] Local cited question→source→pending memory→reviewed digital-self flow
- [ ] Indexed and paginated semantic/relevance search for very large stores
- [ ] Stable user-curated project register with independently verified outcomes
- [ ] Explicit correction/change history for preferences and decisions
- [ ] User-selectable privacy sensitivity/redaction and encryption strategy
- [ ] Authorized connector/MCP interface for other AI clients
- [ ] Long-term usage tests with real format variations and drive restore verification

The order is deliberately evidence-first: we won't describe unsupported capabilities as delivered or expose personal conversation archives in public CI.
