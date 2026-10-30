# SiranOS upgrade and data safety

This public repository is a standalone **alpha extension** for anyone. It does not contain or migrate any maintainer's personal browser data, private knowledge base, or cloud credentials.

**Before upgrading an installed SiranOS build:**

1. Export available local conversation indexes and approved-memory snapshots; separately retain original vendor exports.
2. Back up the current extension folder and browser profile. Never publish those backups or add them to this repository.
3. Check the extension ID and the `oauth2.client_id` locally; replacing or moving an unpacked extension can change its identity and disconnect local IndexedDB data.
4. Test the new build in a separate browser profile with `examples/demo-conversations.json` first.
5. Do not overwrite a working installation or delete earlier backups until data restoration and cloud permissions have been verified against real test records.

**Compatibility:** This early public alpha does **not** promise automatic migration from unrelated extensions or earlier private prototypes. Any previous backup format may require an explicit one-time migration tool in a future release. Never paste secrets or personal exports in a public issue.
