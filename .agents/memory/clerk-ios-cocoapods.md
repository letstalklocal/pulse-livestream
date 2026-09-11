---
name: Clerk iOS CocoaPods
description: Native iOS requirements that prevent EAS pod-install failures with Clerk on Expo SDK 57.
---

For Expo SDK 57 iOS builds using the current Clerk Expo package, generate the native project with an iOS 17.0 deployment target and `use_modular_headers!` in the Podfile. Set the target through `expo-build-properties`, then enforce it across every Xcode build configuration in the local config plugin.

**Why:** EAS CocoaPods installation failed because Clerk required iOS 17 while Expo generated a 16.4 target, and AppCheckCore’s GoogleUtilities and RecaptchaInterop dependencies lacked module maps as static libraries. The build-properties setting alone left project-level Xcode configurations at 16.4.

**How to apply:** Preserve the static build-properties declaration plus the generated-native Xcode and modular-header settings. Keep the plugin idempotent because Expo Launch regenerates the iOS project on every managed build, and verify prebuild output contains no 16.4 targets.