# Message translation

Settings → Preferred language applies to live chat and DMs. Preferences are stored per signed-in account on the device. Automatic translation is off by default. The live-chat language icon toggles it for live rooms; the DM header icon toggles it for that conversation. Long-press an incoming text message for manual translation. The small language icon appears only on translated messages; tap it to switch to the original.

Before first use, the app explains that selected message text is sent to Google Cloud Translation. Only text and target language are sent, not user names, account IDs, conversation IDs, authentication tokens, or attachments. Identifying information typed within a message remains part of its text. This is server-side translation, not end-to-end encryption: the app server and Google process the selected text.

## Enable the service

1. In a Google Cloud project with billing enabled, enable **Cloud Translation API**.
2. Create a server API key and restrict its API access to **Cloud Translation API**. If the deployment has stable outbound IP addresses, restrict the key to those addresses too. Do not use mobile/referrer restrictions for a server key.
3. Put the key in **Replit Secrets** as `GOOGLE_TRANSLATE_API_KEY`. Do not put it in source code, a mobile `EXPO_PUBLIC_*` variable, or chat.
4. Restart the API process so it receives the secret, then test with non-sensitive sample messages between two accounts.
5. Set Google project quotas and billing alerts appropriate for the app. The API also defaults to a 100,000-character daily safety limit per process, configurable with `TRANSLATION_DAILY_CHARACTER_LIMIT`. That local counter resets on restart and is not a substitute for provider quotas, especially with multiple server instances.

Without the key, the status endpoint returns unavailable and original messages remain readable. `available` means configured, not a successful provider credential/billing check. Invalid keys, provider errors, and timeouts return a generic error without exposing provider payloads.

## Access and retention

- Both endpoints require a valid Clerk identity mapped to a local user.
- Translation accepts stored message IDs, never arbitrary caller-supplied text. DMs require sender/recipient membership. Live chat requires current stream access, no removal/block, and Premium admission where applicable.
- Authorization runs before every cache lookup, including previously translated messages.
- HTTPS is used for provider requests, redirects are rejected, and requests time out after eight seconds. HTTP responses use `Cache-Control: no-store`.
- No message bodies, translations, API keys, or provider errors are logged by the translation routes. The application request logger records method/path/status, not request/response bodies.
- Server translations exist only in a bounded memory cache for ten minutes, scoped to message and target language. Matching concurrent requests share one provider request. No translation database or disk cache is created.
- Client results use account-scoped React Query memory entries, with no persisted translation cache; inactive entries expire after ten minutes.
- Requests are limited to 120 per account per minute, with at most 20 distinct provider requests in flight per process. Provider errors temporarily pause new requests. Originals are never overwritten.

Google's data-use policy states that Cloud Translation text is held briefly in memory, used only to provide the service, and not used to train translation features: https://cloud.google.com/translate/data-usage . The Basic endpoint is global; it does not guarantee processing within a particular region.

## Validation

`node artifacts/api-server/tests/message-translation.integration.mjs` runs against isolated database fixtures with a mocked Google HTTP response. It checks authentication, DM access and cached-access rechecks, trusted stored text, minimum provider payload, deduplication, removed/blocked viewers, Premium entry, ended streams, same-language handling, provider failure, unchanged originals, and rate limits. It sends no customer messages to Google.
