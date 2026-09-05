---
name: Agora RTC and RTM Android native collision
description: Why Agora RTC and RTM cannot both be autolinked in the current Android build.
---

Do not autolink Agora RTC 4.5.x and Agora RTM 2.2.6 into the same Android APK. Keep RTC linked for live video and let messaging use its database-backed fallback instead of Android RTM.

**Why:** Both native SDKs package `libaosl.so`. Android packaging selected RTM's older copy, which lacks `aosl_mpq_set_named_oneshot_timer`; RTC then failed during `dlopen` before its engine could initialize.

**How to apply:** When changing either Agora package, inspect the resolved Android autolinking list and the final APK's `libaosl.so`. Re-enable Android RTM only after confirming both SDKs use a compatible shared AOSL build.