---
name: Clerk iOS CocoaPods
description: Native iOS requirements that prevent EAS pod-install failures with Clerk on Expo SDK 57.
---

For Expo SDK 57 iOS builds using the current Clerk Expo package, generate the native project with an iOS 17.0 deployment target and `use_modular_headers!` in the Podfile.

**Why:** EAS CocoaPods installation failed because Clerk required iOS 17 while Expo generated a 16.4 target, and AppCheckCore’s GoogleUtilities and RecaptchaInterop dependencies lacked module maps as static libraries.

**How to apply:** Preserve both generated-native settings in the existing config plugin. Keep the modification idempotent because EAS regenerates the iOS project on every managed build.