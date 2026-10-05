# Android testing build workflow

**October 1 config update:** The user removed the active EAS profiles to keep the mobile Expo project on `app.json` alone. EAS build commands below are historical until the profile is restored from `app.json`; see [EAS configuration migration](eas-config-migration.md).

## Android development purchase-mode correction — September 20, 2026

User reported Android test coin purchases disappeared after switching the shared `EXPO_PUBLIC_REVENUECAT_MODE` to `store` for Apple testing. Confirmed shared mode is `store` and no Android public SDK key is configured; prior selection therefore disabled Android purchases. `purchaseConfiguration()` now explicitly uses RevenueCat Test Store for Android development (`__DEV__`) even when the shared mode is `store`. iOS TestFlight remains Apple store mode; Android release builds still require a Google public SDK key in store mode and do not silently fall back to simulated purchases. No wallet/backend behavior or build profiles changed. Android development must fully reload the bundle to initialize the SDK with the restored configuration. Native device purchase confirmation remains pending. User requested separate settings: `EXPO_PUBLIC_REVENUECAT_IOS_MODE` and `EXPO_PUBLIC_REVENUECAT_ANDROID_MODE` now take priority over the legacy shared mode. Android development defaults to test even with shared store mode; explicitly setting Android mode to store enables future Play testing with a valid Google key. iOS mode falls back to the existing shared mode, currently store. No new secrets are required for the current configuration.

User-confirmed requirement: 2026-09-15.

Use the already-installed EAS CLI and the existing development profile:

```bash
cd /home/runner/workspace/artifacts/mobile
eas build --platform android --profile development
```

This produces the development client used with the running Replit Metro server. Verify that the installed client loads the current Android bundle; see [bundle verification](../.agents/memory/android-dev-client-bundle-verification.md).

## Preserve the working environment

### Next Android build: enable native compilation caching — October 5, 2026

User approved enabling native compilation caching for the **next Android development build**. Before starting that build, add `android.env.EAS_USE_CACHE: "1"` to the existing `development` profile in `artifacts/mobile/eas.json`, preserving other profile settings and app identifiers. Do not apply this to iOS or change builder size/CPU architectures as part of this decision. This explicit authorization supersedes the general restriction below only for this caching setting.

The October 5 Android build log reported `EAS_USE_CACHE=0` on a four-CPU builder. Enabling caching saves/restores native compilation results; the first successful cache-enabled build populates the cache, and later builds may be faster. Avoid `--clear-cache` for ordinary builds unless troubleshooting specifically requires it. Verify the next build log reports the effective setting and cache behavior; no specific time reduction has been measured. See [Expo caching documentation](https://docs.expo.dev/build-reference/caching/).

Implemented October 5 before the user's next rebuild: `development.android.env.EAS_USE_CACHE` is now `"1"` in `artifacts/mobile/eas.json`. Build-log confirmation and measured speed improvement remain pending.

- Read this workflow before giving Android build commands.
- Do not substitute `npx eas-cli@latest`, install/reinstall EAS, or update the CLI as part of a routine build request. Use the installed `eas` executable.
- Do not switch to `preview` or change EAS profiles, environment variables, dependency versions, or package-manager configuration just to provide the build command.
- A request for a build or build command does not authorize a tooling upgrade or environment change. If the installed CLI cannot perform the build, inspect the actual error and explain the necessary change before requesting explicit authorization for that change.
- Do not advise accepting optional CLI update prompts. If an update is required, handle it separately under the preceding rule.

## Reason for this requirement

The assistant incorrectly suggested a standalone preview build and then substituted `npx eas-cli@latest` for the installed CLI. The user accepted its install/update prompt and received npm dependency-deprecation warnings. The user explicitly warned that unnecessary tooling changes could disrupt the working environment and required this note. The temporary preview-profile edits were reverted. The warnings alone did not establish that the environment was broken; no such damage has been verified.
