# Public release privacy checklist

- [x] This source tree does not embed a real person's chats, personal profile, school/employer, Drive document IDs, or API tokens.
- [x] Demo messages and multi-provider ZIP fixture are fictional; run `npm run privacy-check` locally before submitting a PR.
- [x] No code path uploads personal data to GitHub; Google Drive is separate, opt-in and not end-to-end encrypted.
- [ ] **Repository history**: inspect authors and committers of **every reachable commit** and use a GitHub `noreply` address; rewriting branch tips alone cannot guarantee old SHA URLs or third-party clones disappear.
- [ ] **Release**: review all PR descriptions, issue attachments, release assets, CI logs, and forks before announcing the repository as privacy-audited.

Any person using this extension supplies **their own** exports. Approving a memory does not prove the claim is true. The app has no access to the maintainer's private knowledge corpus and never bundles a pretrained profile.
