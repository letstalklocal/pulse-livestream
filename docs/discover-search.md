# Discover user search

Recorded: 2026-09-12

The Discover header has a white 22-point `search-outline` icon matching Messages, beside Go Live. It opens a dedicated user search screen; selecting a result opens the public profile. The Following tab and Messages controls retain their existing behavior.

Search uses the existing account `name` field (the app has no separate unique username field). `/api/users?q=...` returns up to 30 matching accounts, including offline users, with case-insensitive substring matching. Exact matches rank first, then prefixes. Blank searches return no users; malformed or over-64-character queries fail validation. SQL wildcard characters are literal. Signed-in searches exclude blocks in either direction. Only uid, name, and a signed avatar URL are returned.

The screen debounces typing by 300 ms, clears old-query results immediately, isolates its cache by account, and includes loading, retry, empty, clear, and cancel states. Controls are translated in all ten bundled languages.

Validation: mobile/API typechecks, search integration (matching, ordering, offline users, limits, validation, wildcard escaping, public fields, both blocking directions), localization regression, and production iOS JavaScript export passed. The development API was rebuilt/restarted with its environment preserved and its search endpoint responds successfully. Native visual/touch checks remain pending: icon size on iPhone/Android, typing/clearing, keyboard dismissal, profile navigation/back, and no-results/offline states.
