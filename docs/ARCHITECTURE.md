# Architecture · early alpha

## Local-first data flow

1. The user selects a file. `extension/importer.js` identifies recognized chat objects, creates provider-qualified IDs and preserves source JSON per conversation.
2. `extension/db.js` stores records in browser IndexedDB and archives changed versions, using its own namespaced public-alpha database.
3. `extension/brain.js` normalizes source messages and extracts rule-matched candidates only from user roles. It records conversation ID, source hash, message index and quote.
4. The user verifies/approves or dismisses a candidate. A changed source hash invalidates the original candidate until re-reviewed.
5. `extension/persona.js` constructs an on-demand projection from approved and nonstale memories. There is deliberately no personality scoring, demographic guessing, action authentication, or external model invocation.
6. `extension/options.js` provides local UI plus export JSON. The service worker optionally pushes recognized source records and memory snapshot to a Google Drive directory.

## Evidence model

`record { id, provider, title, raw, hash, searchText, ... }`

`memory { id, type, text, status, project, source: { conversationId, sourceHash, messageIndex, quote }, sourceStale, ... }`

`digitalSelf { schema, groups, entries, projects, summary, caveat }`

The JSON export contains source references and can include quoted private content. It should never be pushed to GitHub by default.

## 0.2 evidence workflow

`extension/streaming.js` parses recognized ChatGPT `chat.html` embedded JSON arrays and large root-array JSON by sequential bounded objects. `extension/qa.js` performs local lexical matching against **user** messages, retrieving a source hash, conversation/message index and excerpt. The answers are **extractive**, not AI synthesis. A selected result goes through `SiranBrain.proposeEvidence` for a fresh source/role/hash check, creates a pending candidate, and only appears in Digital Self after manual review. `SiranDB.forEachConversation` uses an IndexedDB cursor to bound read memory; it is **not yet a persistent inverted index**.

## Operational limitations

- Keyword search still iterates local records; question-answer mode uses an IndexedDB cursor, but large archives need a persistent index, worker-based cancellation and performance benchmarking.
- Ordinary ZIP is loaded fully and has a protective 180 MiB guard; ZIP64 remains unsupported. Separate root-array JSON and ChatGPT `chat.html` streaming have a per-conversation 64 MiB limit.
- Files such as `chat.html` may contain rich content or conversation branches not represented by these import adapters.
- Drive restore and Google OAuth require real-account end-to-end validation; mock tests are not a substitute.
- Future independent plugins/MCP clients need an explicit authorized transport. Browser local data isn't globally reachable.
