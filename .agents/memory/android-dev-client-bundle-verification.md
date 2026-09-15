---
name: Android dev-client bundle verification
description: How to distinguish a connected Expo Android development client from an APK running an old embedded bundle.
---

Do not treat an Android app opening from an `exp+` link as proof that it loaded the current Metro bundle. Require either an Android bundle request in Metro or a unique, visible marker from the current JavaScript.

**Why:** An installed APK can handle the development URL and open its normal app screen while continuing to run an older embedded bundle. Native debugging then produces misleading camera results and no current Agora events.

**How to apply:** Before diagnosing native camera or Agora rendering, add or identify a visible current-build marker and confirm Metro reports an Android bundle request. If neither appears, clear Android app storage/data (cache alone and install-over can preserve the stale bundle), reconnect to Metro, and verify the marker before requiring a fresh development build.

**User-confirmed build command (2026-09-15):** From `artifacts/mobile`, use `eas build --platform android --profile development`. Use the installed CLI; do not substitute `npx eas-cli@latest`, recommend optional CLI upgrades, or alter profiles/environment for a routine build request. The user explicitly flagged the risk to the working environment. Read [the full workflow](../../docs/android-build-workflow.md); any required tooling change needs a separate explanation and explicit authorization.
