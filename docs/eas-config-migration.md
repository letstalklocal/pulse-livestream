# EAS configuration backup

**Current workflow (2026-09-15):** `artifacts/mobile/eas.json` exists. For Android testing, follow [the installed-CLI build workflow](android-build-workflow.md). The restoration instructions below are historical and only apply if the active file is missing; do not overwrite the current configuration during a routine build request.

The mobile artifact previously had an `eas.json` containing development,
preview, production, and submission profiles. It was removed from
`artifacts/mobile` by request.

Its settings are preserved in two places:

- `docs/config-backups/eas.json` is a verbatim restorable copy.
- `artifacts/mobile/app.json` contains the same data under
  `expo.extra.easConfigurationBackup`.

## Important behavior

EAS CLI does not read build profiles from `app.json`. The copy under
`expo.extra` preserves the data but does not activate those profiles. Without
an `eas.json` in the mobile project, commands that name the former
`development`, `preview`, or `production` profiles will not use their previous
development-client, internal-distribution, APK, or auto-increment settings.

## Restore EAS builds

Before running an EAS build that depends on the former profiles, copy:

`docs/config-backups/eas.json`

to:

`artifacts/mobile/eas.json`

Keep the backup and the `expo.extra.easConfigurationBackup` copy synchronized
if the restored EAS configuration is changed later.