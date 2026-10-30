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
