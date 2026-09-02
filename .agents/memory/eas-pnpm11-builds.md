---
name: EAS pnpm 11 builds
description: Dependency build-script permission compatibility for SDK 57 Android builds on EAS.
---

For EAS builds that install the workspace with pnpm 11, declare approved dependency scripts with `allowBuilds`; retaining `onlyBuiltDependencies` can preserve local compatibility with pnpm 10.

**Why:** EAS treated ignored dependency build scripts as a fatal installation error even though local pnpm 10 accepted `onlyBuiltDependencies`.

**How to apply:** When an EAS build fails with `ERR_PNPM_IGNORED_BUILDS`, add the named trusted packages to `allowBuilds` before retrying. Do not repeatedly submit chargeable builds without checking the phase logs.