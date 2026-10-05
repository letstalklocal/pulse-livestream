# IP-based country location

Added 2026-09-10 at the user's request: determine the country from the connection IP and populate the profile location. This supersedes “Location coming later.” Hide VIP Level remains coming later.

## Behavior

- **Latest user decision, October 5:** save the country from the first successful account IP lookup and keep it fixed. The signed-in app retries detection on startup/foreground only while country is unset; once saved, it removes the refresh listener. Traveling, VPN changes, sign-in and other devices must not replace that country.
- Only the country code is saved in `users.country_code`; the profile response derives the country name. This feature does not save the raw IP, city, coordinates, or movement history.
- No device location/GPS permission or external per-visitor geolocation request is needed. Lookups run against a local database.
- Country appears on the profile when available. An unknown/private IP leaves an unset country eligible for a later attempt; no country is invented for missing results. Existing saved countries are retained.
- Privacy → Profile → Hide Location is now active and hides country/code from public profile responses, as well as the profile UI. The authenticated owner can still retrieve their own detected country through the refresh endpoint.
- This is the approximate connection country at first successful detection, not verified residence or nationality. A VPN during that initial lookup may set the exit server's country.
- Chat layout, keyboard behavior, read receipts, and other approved chat requirements are unchanged; see [chat preferences](chat-message-preferences.md).

## Backend and operation

- `POST /api/location/country` authenticates the caller and initializes only that account's unset country. It returns an already-saved country without geolocation. The database write requires `country_code IS NULL`, so concurrent requests cannot overwrite the first winner. It does not accept a client-provided IP, country, or account ID.
- `countryLocation.ts` uses `proxy-addr` to walk from the direct connection through trusted proxy hops. It stops at the first untrusted hop rather than taking an arbitrary leftmost forwarded IP.
- Default trusted ingress ranges: loopback, link-local, and private networks. `COUNTRY_TRUSTED_PROXIES` can replace these with deployment-specific comma-separated addresses/CIDRs. Configure additional public ingress ranges only when the deployment actually trusts them; never use unrestricted forwarding trust.
- Invalid/private/reserved IPs are not geolocated. Do not use this inferred country for authentication or security decisions.
- `ip-location-api` uses the country-only `user` dataset from [ip-location-db](https://github.com/sapics/ip-location-db), described by the [library documentation](https://github.com/sapics/ip-location-api) as CDLA-Permissive-2.0. Its normal database update mechanism is retained. Downloads update the whole database; they do not include visitor IPs.
- Database files are managed by the dependency and must be writable for initial preparation/updates. Preserve them between deployments where possible. The library is externalized in the server build so its data paths resolve correctly.
- Initialization may download the database on a fresh install. The local workspace database was prepared during integration testing. A lookup error does not block sign-in or replace the saved country.
- Apply `lib/db/migrations/20260910_country_location.sql` before starting the updated server. It is applied in this workspace.

## Validation

`artifacts/api-server/tests/country-location.integration.mjs` verifies direct/forwarded IP selection, spoofed forwarded-header rejection, IPv4/IPv6 lookup, authentication, country persistence, ignored request-body country/account values, private/unknown-IP retention, and public Hide Location redaction.

Device/profile appearance and a real visitor's ingress routing still require preview/device observation; server integration tests do not establish the user's actual country.

## Colombia production report — October 5, 2026

User identified Valentina Pineda as the affected production tester. Read-only public production lookup matched UID 58212 and confirmed `US` / United States currently saved. No production profile value was changed. Country and interface language are independent; the tester's manual switch to Spanish does not correct or prove IP detection.

Earlier checkpoint, superseded by the user's fixed-country decision above: country refreshed after sign-in and foreground return and overwrote the saved country when a valid match was found. Proxy IP selection, VPN routing, database failure or stale state remain possibilities, not established causes. Production ingress/logs for the tester have not been inspected.

The country endpoint logs account UID and a country-only detection outcome (`updated`, `already_set`, `no_public_ip`, `no_country_match`, `lookup_failed`), without raw IPs or forwarded headers. Root cause and Colombia production correction remain pending; no trusted proxy ranges were broadened and no country was inferred from the phone language. The new fixed-country rule intentionally retains Valentina's existing US value; no automatic correction or production edit was performed. Future calls for that account return `already_set` rather than repeating geolocation.

Fixed-country checks cover retaining Colombia despite a later US IP, concurrent first detections, unknown first IP retry, ignored client body values and privacy. Account-sync checks cover stopping startup/foreground lookups when country is saved. Types/build and actual phone verification must be reported separately; production publication remains pending.
