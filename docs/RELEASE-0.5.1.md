# SiranOS 0.5.1 Alpha — reliability and privacy-boundary fixes

This is a focused, non-destructive patch on the unmerged 0.5 development branch. The previous Google options remain optional; no private user export is included.

## Resolved findings

1. **Temporary parsing failure:** keep the last successfully indexed snapshot, record an error state and withhold affected results from search / profile / evidence until the original content is verified again. A byte-identical restore preserves previously approved records.
2. **Delete and restore:** a truly removed source invalidates evidence; re-adding the same content creates a new pending review rather than silently reinstating an old approval.
3. **File-integrity check:** verify SHA-256 for each <=48 MiB file even when file size and mtime are unchanged. Unchanged content skips expensive parsing. This can increase I/O on large corpora.
4. **Safe report reading:** refuse symlinks and non-regular files, validate opened file identity, and cap curated read size before exposing it to a local MCP client. An intentionally unsafe report causes a read error instead of leaking the external file.
5. **Correct latest report:** choose by embedded generation timestamp, with filesystem mtime fallback for legacy files.
6. **All approved memories:** full local profile and Markdown export retain all valid approved entries. The `siranos_profile` MCP tool returns 100 entries by default with `offset`, `limit` (up to 500), `total`, `returned`, `hasMore` for pagination. The AI context file remains deliberately limited to the 60 most recent entries and states the count.
7. **Idempotent init and custom scheduler folder:** reinit without options preserves settings. A new `scheduled-run.mjs` wrapper carries `SIRANOS_HOME` explicitly into user-level tasks. OS registration is only mocked/tested for Windows; real platform E2E still required.

## Verification

- `npm test` (existing suites and `tests/test-regressions.mjs`)
- `npm run lint`
- `npm run privacy-check`
- Run the synthetic regression suite with `node --no-warnings tests/test-regressions.mjs`.

## Still not ready for a general-audience stable release

- No complete encrypted backup/restore tool spanning `Documents/SiranOS` and the separate local SQLite/config directory.
- No real Windows/macOS/Linux scheduler installation acceptance test, and no multi-device conflict resolution.
- No semantic LLM-derived profile; the system only stores evidence and user-reviewed statements.
- No full ZIP64/multi-GB export handling or scanned-document OCR.
- Public Git commit author/committer email history requires separate explicit remediation; the privacy scan covers text files, not Git metadata.
- Stacked PRs remain unmerged, and `main` does not yet contain an installable release.
