---
name: TestFlight production environment
description: Current production environment rule for Pulse TestFlight builds; supersedes earlier development setup.
---

**Current decision — September 16, 2026:** The user explicitly confirmed that TestFlight now uses the Replit production environment and no longer uses development. Diagnose TestFlight failures against production. Do not reconfigure TestFlight back to development. The exact installed build's hostname/service configuration must be verified; a production EAS profile name alone is not endpoint evidence.

The following development instructions are historical and superseded for environment selection:

**Why:** The user confirmed TestFlight is the testing channel and should use development accounts and data rather than the separately isolated production Clerk and backend environments.

**How to apply:** Keep the EAS environment used by the TestFlight production build profile synchronized with the development public variables. Revisit this decision before an App Store production release.

**RevenueCat exception explicitly approved 2026-09-15:** `artifacts/mobile/eas.json` sets `EXPO_PUBLIC_REVENUECAT_MODE=test` and `PULSE_TESTFLIGHT_BUILD=true` in `build.production.ios.env` for the next TestFlight build. The app-config guard permits this explicit iOS testing exception. Keep the existing installed-CLI command `eas build --platform ios --profile production`; do not upgrade CLI or change other service variables. Before public App Store release, remove the TestFlight flag, use real-store mode/Apple SDK key, and complete production fulfillment/QA. The flag expresses build intent and cannot detect or prevent later public release of a test binary. See `docs/revenuecat-integration.md` for verification.

The September 16 correction changes the recorded backend environment requirement; it does not authorize altering RevenueCat mode or other separate service settings. No EAS variables or deployment were changed while documenting the correction.

Confirmed production API hostname from the user: `chimbalivestream.replit.app`. Affected iPhone TestFlight build: `1.0.2 (11)`. The workspace-linked EAS project still listed a development `EXPO_PUBLIC_DOMAIN` at inspection; do not treat that as the installed build configuration or overwrite it without resolving the project/build mismatch.
