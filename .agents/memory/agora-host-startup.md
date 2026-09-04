---
name: Agora host startup
description: Verified startup requirement for reliable Android broadcaster camera rendering.
---

Do not let a host create or join a livestream before the Agora engine, video,
audio, and local camera preview are ready. Surface initialization failures and
keep the Go Live action disabled until readiness is confirmed.

**Why:** Starting the stream before Agora initialization completed caused a
black host camera screen and failed to queue the channel join. Readiness gating
and pre-live preview were confirmed to restore the camera on a real Android
development build.

**How to apply:** Preserve the readiness gate and local preview whenever the
broadcaster lifecycle is changed. Validate host initialization before debugging
remote viewer rendering.