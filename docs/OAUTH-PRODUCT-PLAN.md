# Production vision: one-time Google account sign-in (not yet built)

## Product contract

An agent installs SiranOS, the user presses **Connect Google Drive**, signs in to a Google account and selects a Drive folder. Uploading chat archives and documents to that folder triggers incremental indexing and the personal second brain is accessible from Codex and WorkBuddy through a local/authorized MCP endpoint. The app must ship with a publisher-controlled, verified OAuth consent screen, not require every end user to create a Google Cloud project.

## Why the current Drive for desktop prototype is not the final UX

Drive for desktop requires a second installed Google application and local synchronization. It cannot parse cloud-native `.gdoc/.gsheet/.gslides` pointer files. Cloud-sign-in-only operation, including a Google Drive web folder with no local mount, is **not** supported today.

## Steps before promising production onboarding

1. Publisher registers a Google Cloud project, configures the OAuth consent screen, publisher identity/privacy policy and verification process as applicable. Authenticate using a system browser and the supported OAuth native-app redirect/PKCE flow or a first-party hosted application, never embedded passwords or a shared client secret in Git.
2. Implement user-initiated Google Picker folder/file selection with the narrowest workable Drive scope (e.g., `drive.file` for user-picked files). Verify whether nested folder content is actually available under that scope; **do not assume** choosing a folder gives recursive rights to every existing file.
3. For broader Drive tree access, assess Google's sensitive/restricted Drive scopes, verification and security-assessment obligations. Do not silently broaden scopes.
4. Implement Google Drive `changes.getStartPageToken` + `changes.list` delta sync, paging, cancellation, quota backoff, trash/removal, stale-source invalidation, Google Docs export formats and per-provider chat importers.
5. Implement robust, bounded ZIP64/chat archive parsing and a resumable indexing queue with clear success/failure coverage accounting.
6. Add semantic retrieval, calibrated citations, reviewable long-term memory, user-controlled retention/deletion, encryption and cross-device authenticated service design. Publish an independent privacy/security audit before wide adoption.
7. Test both Codex and WorkBuddy with real installations, real Google OAuth and an opt-in synthetic test account. No real user data in repository, CI, issues or example fixtures.

## Google API references

- Drive scopes: https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- Changes feed: https://developers.google.com/workspace/drive/api/guides/manage-changes
- Drive for desktop: https://support.google.com/drive/answer/13401938
