---
name: TestFlight development environment
description: Environment-selection rule for Pulse TestFlight builds.
---

Pulse TestFlight builds intentionally connect to the development Clerk instance, development API/database, and development Agora configuration. Do not add the production Clerk proxy URL to this EAS environment.

**Why:** The user confirmed TestFlight is the testing channel and should use development accounts and data rather than the separately isolated production Clerk and backend environments.

**How to apply:** Keep the EAS environment used by the TestFlight production build profile synchronized with the development public variables. Revisit this decision before an App Store production release.

**RevenueCat exception explicitly approved 2026-09-15:** `artifacts/mobile/eas.json` sets `EXPO_PUBLIC_REVENUECAT_MODE=test` and `PULSE_TESTFLIGHT_BUILD=true` in `build.production.ios.env` for the next TestFlight build. The app-config guard permits this explicit iOS testing exception. Keep the existing installed-CLI command `eas build --platform ios --profile production`; do not upgrade CLI or change other service variables. Before public App Store release, remove the TestFlight flag, use real-store mode/Apple SDK key, and complete production fulfillment/QA. The flag expresses build intent and cannot detect or prevent later public release of a test binary. See `docs/revenuecat-integration.md` for verification.
