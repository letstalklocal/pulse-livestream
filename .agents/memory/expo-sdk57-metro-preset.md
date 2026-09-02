---
name: Expo SDK 57 Metro preset
description: Metro dependency resolution behavior for Expo SDK 57 in this strict pnpm workspace.
---

Declare `babel-preset-expo` directly in the mobile package, even though Expo installs it transitively.

**Why:** Strict pnpm isolation left the transitive preset in the package store without linking it where Metro resolves Babel presets, causing bundles to fail only after a workflow restart.

**How to apply:** Keep the preset version aligned with the installed Expo SDK and verify a fresh workflow restart can bundle both web and Android.