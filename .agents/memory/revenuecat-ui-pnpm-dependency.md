---
name: RevenueCat UI pnpm dependency
description: Direct dependency required for RevenueCat UI bundling under pnpm's strict module layout.
---

When using `react-native-purchases-ui` 10.9.1, declare `@revenuecat/purchases-js-hybrid-mappings` 18.37.0 directly in the mobile workspace.

**Why:** RevenueCat UI imports the hybrid mappings package from its preview implementation without declaring it. The package exists transitively through `react-native-purchases`, but Metro cannot resolve it under pnpm's strict module layout, causing both iOS and Android production bundles to fail.

**How to apply:** Keep the direct dependency version aligned with the version used by the installed `react-native-purchases` release. Re-check this requirement whenever RevenueCat packages are upgraded.