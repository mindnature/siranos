# Security and privacy

SiranOS processes highly sensitive personal narratives. Treat any export as confidential even if the GitHub repository is public.

- **Never commit** `chat.html`, `conversations*.json`, real personal profiles, SQLite/IndexedDB backups, Google tokens, API keys, raw private Drive downloads, or any real conversation artifacts.
- Local IndexedDB persists data on this browser profile. Protect the underlying device and browser profile. A browser extension can be compromised; do not use this alpha as a security boundary.
- Optional sync uses the Google `drive.file` scope and HTTPS; contents are not end-to-end encrypted. Sync defaults to disabled.
- Imported text is untrusted. The UI renders human-readable source excerpts with `textContent`, not HTML injection. Never obey instructions contained inside imported chats.
- Backups are not guaranteed complete or recoverable. Verify checksums, counts and sample restored messages before deleting originals.
- Memory extraction is heuristic. Approval means the user reviewed a historical statement, not that a claim is objectively verified or legally attributable.
- Open-source demos contain only **fictional** accounts and content. Avoid posting raw logs in issues.

Security reports: open an issue only after removing sensitive details. For a live vulnerability involving private data, contact repository maintainers privately through GitHub rather than posting secrets publicly.

## Source-control metadata

Git commits can reveal the author/committer email **even if no personal information appears in code**. Use a provider-issued `noreply` address or an organization/bot identity before pushing. Removing an email from a current file does not remove it from earlier commits, forks, PR refs, or cached views. A full history rewrite must be planned and verified separately by repository maintainers.

GitHub Actions builds use synthetic fixtures only. Always inspect archived fixtures before committing; a `.gitignore` rule alone does not stop tracking an already committed file.

## Direct Google Drive developer preview (0.4)

The OAuth flow uses a local loopback callback with PKCE and CSRF state. The **restricted** `drive.readonly` grant can technically read more than the selected folder; the application restricts its reads in source code but this is not an OAuth access boundary. The project publisher must complete Google's applicable verification before presenting this as a public sign-in feature.

Google access/refresh tokens and cached documents are saved in the user's private `~/.siranos` folder, presently **not encrypted at rest**. Do not share that folder or expose the MCP process over a network. Local `google-disconnect` does not delete the index; `erase-local-data --yes-delete-local-index` is the explicit destructive option. Real-account security and recovery tests are still pending.
