# Upgrade a legacy unpacked Siran LifeOS extension

The GitHub alpha is **not** an automatic update to a previously installed extension. The old Chrome extension may contain data and an OAuth client ID bound to its extension ID.

**Safe first step:** close old extension tabs, keep the original extension enabled, export available memory/index snapshots, and copy the entire old extension source folder to a private backup outside GitHub.

**Optional developer migration:** compare sources; move all updated `extension/*.js`, `options.html`, and `style.css` into the *existing path*. Add the new `persona.js` file and ensure `options.html` loads it before `options.js`. Keep the original `manifest.json` OAuth ID and existing browser extension ID; do not copy this repository's placeholder manifest over a configured one. Increment the installed manifest version if needed, keeping the same permissions and URLs.

Reload once from `chrome://extensions`. Test old conversation counts, original-source preview, memory review and optional Drive connection. Do not remove older backups until restored records have been verified.

This procedure is **not** yet tested against every deployed V2/V3 install. For a safer public test, install the GitHub alpha in a separate Chrome profile with synthetic data (Google OAuth would then require a separate client configuration).
