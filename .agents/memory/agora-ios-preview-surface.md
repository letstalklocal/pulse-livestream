---
name: Agora iOS preview surface
description: Cross-platform rendering constraint for Agora video views in mobile stream cards.
---

Use `RtcSurfaceView` for stream-card video previews that must render on iOS. Do not use `RtcTextureView` for cross-platform previews.

**Why:** The Agora 4.5.x React Native type documentation explicitly marks `RtcTextureView` as Android-only and unsupported on iOS; using it leaves the iOS card fallback visible even when the audience join succeeds.

**How to apply:** Use `RtcSurfaceView` for iOS or shared iOS/Android preview components. Keep the native view mounted while waiting for the first remote frame, and reveal it only after decode readiness.