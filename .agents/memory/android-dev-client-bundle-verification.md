---
name: Android dev-client bundle verification
description: How to distinguish a connected Expo Android development client from an APK running an old embedded bundle.
---

Do not treat an Android app opening from an `exp+` link as proof that it loaded the current Metro bundle. Require either an Android bundle request in Metro or a unique, visible marker from the current JavaScript.

**Why:** An installed APK can handle the development URL and open its normal app screen while continuing to run an older embedded bundle. Native debugging then produces misleading camera results and no current Agora events.

**How to apply:** Before diagnosing native camera or Agora rendering, add or identify a visible current-build marker and confirm Metro reports an Android bundle request. If neither appears, clear Android app storage/data (cache alone and install-over can preserve the stale bundle), reconnect to Metro, and verify the marker before requiring a fresh development build.