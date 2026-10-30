# SiranOS 0.4 — direct Google Drive developer preview

This is a **developer preview**, not a verified public Google app. It reads a Google Drive folder via Google Drive API v3 directly, without installing Google Drive for desktop. **Production onboarding still needs the publisher's Google OAuth app verification and security review.**

## Intended end-user experience (after publisher configuration)

1. Codex or WorkBuddy installs SiranOS once and registers its local stdio MCP bridge.
2. Run `node bridge/cli.mjs google-connect`: your system browser opens the Google OAuth page. Sign in **to Google**, not to Codex; SiranOS does not request the password.
3. Run `node bridge/cli.mjs google-folder "<Google Drive folder URL>"` to grant SiranOS an **application-level folder selection**. You currently paste the URL yourself; a native Google Picker is NOT included.
4. Upload a supported, reasonably sized chat export or document into the selected Drive folder. On the next MCP call, SiranOS checks for changes (up to once every five minutes per active MCP process) and updates its on-device index; run `google-sync` to force an immediate refresh.
5. Ask Codex/WorkBuddy to call `siranos_search` and `siranos_get_evidence` to get source-cited records, or `siranos_profile` to get human-approved personal memories. Search is lexical; AI reasoning depends on the calling assistant, **not** a hidden model in SiranOS.

## Publisher setup (one-time by the SiranOS maintainer)

Google Cloud Console: create a project and enable Google Drive API; create an OAuth **Desktop application** client ID. Configure the app's OAuth brand, support email, verified domain (where applicable), privacy policy, scope declaration and the **restricted-scope review**. Get Google confirmation before marketing one-click onboarding to general users. The native OAuth public client ID may be distributed in `bridge/google-client.json` after publisher verification. A client secret or refresh token must not be checked into git.

For a developer-only test, set environment variable `SIRANOS_GOOGLE_CLIENT_ID` to **your own desktop client ID** (formatted like `123456-xxx.apps.googleusercontent.com`). If Google's desktop client configuration requires its `client_secret`, set `SIRANOS_GOOGLE_CLIENT_SECRET` in the environment only. Neither value should appear in Issues or CI logs. SiranOS uses authorization-code PKCE and a loopback callback on `127.0.0.1`.

```sh
# Run in your local terminal, after configuring the test OAuth client ID.
node bridge/cli.mjs google-connect
node bridge/cli.mjs google-folder "<Google Drive folder URL>"
node bridge/cli.mjs google-sync
node bridge/cli.mjs google-status
node bridge/cli.mjs integration
```

## Security and scope honesty

**The OAuth permission requested is `https://www.googleapis.com/auth/drive.readonly` (restricted), not `drive.file`**. The user's Google consent grants the application the technical ability to read files across their Drive. SiranOS code voluntarily restricts *listing and downloading* to the manually selected folder tree, but the OAuth grant itself **is not folder-scoped**. If this scope is unacceptable, use the Drive for desktop path in `docs/DRIVE-MCP-SETUP.md` instead. A future Google Picker + `drive.file` solution should be researched and tested for recursive access to newly uploaded files. Do not claim this developer preview uses narrow Google Drive permissions.

- Google tokens and downloaded file contents are stored in `~/.siranos` on the user's device, **not encrypted at rest**. File permissions are best-effort; use a private OS account and disk encryption. The MCP server returns evidence only, never OAuth tokens.
- `google-disconnect` removes the local OAuth token and cloud configuration but **keeps** previously indexed knowledge, to avoid surprising data loss. The user should also revoke prior consent in Google Account Security. To remove the entire local SiranOS index/cache/tokens explicitly, use `erase-local-data --yes-delete-local-index`; this **does not delete** original Drive content.
- The selected folder is configured by an explicit URL and checked by Drive metadata before indexing. The service reads only recognized types, enforces a 48 MiB per-file limit and skips unrecognized extensions. Google Docs are exported to `.txt`; Google Sheets to `.csv`. Other native Google Workspace content, images, attachments and ZIP64 archives are not comprehensively supported.
- Remote file metadata, file timestamps and native document exports are best-effort. Pagination and child folders are supported; listing failures abort deletion of old cache records; individual failures are surfaced and a sync is labeled partial.
- The loopback flow and API calls have **only mock/synthetic automated validation**. A real Google account login, verification process, Windows installation, Chrome client and WorkBuddy integration remain acceptance tests. No private test account or real token is stored in this repository.

## How updates work today

When MCP receives a search/profile call, SiranOS attempts a Drive refresh if the last successful refresh was over five minutes ago (in that running process). An explicit `siranos_sync` / `google-sync` refreshes immediately. **There is no always-on background daemon or Google push notification**, so merely uploading a file does not instantly build the index before the next call. Full Drive changes-feed checkpoints, throttling/backoff, better file coverage, encrypted secrets and a graphical folder picker are outstanding.

## Official API references

- https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- https://developers.google.com/identity/protocols/oauth2/native-app
- https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list
- https://developers.google.com/workspace/drive/api/reference/rest/v3/files/export
