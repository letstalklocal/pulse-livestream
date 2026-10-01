# EAS configuration migration

**Current state (October 1, 2026):** At the user’s request, the repository no longer contains any `eas.json` or `app.config.js`. The mobile project uses `artifacts/mobile/app.json` as its only active Expo configuration file. The last mobile EAS settings are retained under `expo.extra.easConfigurationBackup`; this is a backup, not an active EAS configuration. The earlier generic root profile is superseded by that mobile backup.

EAS CLI reads build and submit profiles from `eas.json`, not `app.json`. The documented `eas build --profile development` and `eas build --profile production` commands therefore cannot use their former settings in the current checkout. If EAS is chosen again, restore an `artifacts/mobile/eas.json` from the backup in `app.json` before building, and review the iOS mode, public key, build number and environment against the intended release. Replit Launch timeout cause remains unconfirmed; removing these files has not been validated by a new Launch attempt.

## History

On September 5, an earlier request removed `artifacts/mobile/eas.json` and copied its then-current settings into `app.json` and `docs/config-backups/eas.json`. The active file was added back minutes later and subsequently changed. The October 1 migration replaces that stale backup with the latest mobile profile in `app.json` and removes the separate backup file. `artifacts/mobile/app.config.js`, added September 15 for a RevenueCat Test Store production-build guard, was also removed at the user’s request.
