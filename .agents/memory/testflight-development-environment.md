---
name: TestFlight development environment
description: Environment-selection rule for Pulse TestFlight builds.
---

Pulse TestFlight builds intentionally connect to the development Clerk instance, development API/database, and development Agora configuration. Do not add the production Clerk proxy URL to this EAS environment.

**Why:** The user confirmed TestFlight is the testing channel and should use development accounts and data rather than the separately isolated production Clerk and backend environments.

**How to apply:** Keep the EAS environment used by the TestFlight production build profile synchronized with the development public variables. Revisit this decision before an App Store production release.