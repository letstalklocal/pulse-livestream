# Pulse app identity

**Current requirement (October 2, 2026):** Keep the existing native app and Expo project identity when changing the app’s displayed name. The user intended **Pulse VIP** as the home-screen name only. Do not change the identifiers below as part of a rename, Replit Preview edit, build setup, or config migration. A future identity migration requires a separate explicit decision and review of store listings, OAuth/verification callbacks, and EAS project linkage.

| `artifacts/mobile/app.json` field | Required value | Purpose |
| --- | --- | --- |
| `expo.name` | `Pulse VIP` | Display name; may be changed by an explicit naming request. |
| `expo.slug` | `mobile` | Existing Expo/EAS project slug; linked project ID remains `4119aa26-5e2a-4825-81e0-9612267f331c`. |
| `expo.scheme` | `mobile` | Opens existing `mobile://` links, including Clerk SSO and verification returns. |
| `expo.ios.bundleIdentifier` | `com.chimba.livestream` | Existing iOS/TestFlight app identity. |
| `expo.android.package` | `com.pulse.livestream` | Existing Android app identity. |

The source uses `mobile://sso-callback` in `artifacts/mobile/components/SocialSignInButton.tsx`; the server uses `mobile://verification` for native verification returns. Changing `expo.scheme` alone would break those return paths. A mismatched slug and linked project ID caused an EAS project-config readback failure during the October 1 investigation. The iOS bundle identifier and Android package identify the installed store apps, separate from the displayed name. See [Expo’s app config reference](https://docs.expo.dev/versions/latest/config/app/).

History: Replit’s October 1 `ee7fa12` “Published your App” commit changed all five fields while the user was changing the Preview name. The four identity fields were restored; only the requested display name stayed **Pulse VIP**. Build 28 used earlier source `26aaeaa`, before that accidental identity change. Before any future native build, resolve `app.json` and compare these fields with the table. Keep the repository’s app config in `app.json`; local EAS build profiles are a separate, temporary build concern described in [EAS configuration migration](eas-config-migration.md).
