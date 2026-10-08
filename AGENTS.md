# Project instructions

Before changing the mobile app name, Expo slug, URL scheme, iOS bundle identifier, Android package, or build configuration that could alter app identity, read [docs/app-identity.md](docs/app-identity.md). Preserve the existing app identifiers unless the user explicitly requests an identity migration.

Before changing any viewer/broadcaster screen functionality or shared stream controls, read [docs/stream-screen-regressions.md](docs/stream-screen-regressions.md) and run its required checks. Screen-awake behavior on both Android and iPhone, navigation, header/list behavior and keyboard/dock anchoring are app requirements. Report automated and device verification separately; never call an untested device regression fixed.

Before changing direct messages, chat UI, keyboard/composer behavior, message status indicators, replies, or message preferences, read [docs/chat-message-preferences.md](docs/chat-message-preferences.md).

Before changing stream viewer navigation, swipe transitions, looping, or diagnosing flashes between streams, read [docs/stream-navigation.md](docs/stream-navigation.md). Preserve its accepted behavior and distinguish device confirmations from suspected causes.

Before changing coin artwork, wallet purchases, Premium gift requests, or RevenueCat, read [docs/coins-premium-revenuecat.md](docs/coins-premium-revenuecat.md) and its linked requirements.

Before diagnosing data disappearing after edits, Metro refresh connectivity, Android hostname/DNS errors, or Replit Remote SSH failures, read [docs/development-connectivity.md](docs/development-connectivity.md) and follow its troubleshooting sequence.

Before adding native-only APIs to shared mobile modules, adding platform-specific implementations, or diagnosing web preview/artifact reload errors, read [the web/native cache and Metro reload requirements](docs/development-connectivity.md#october-8-web-preview-native-file-cache-crash-and-stale-reload-graph). Never execute native file-system constructors or native path getters on web, including during module import. Verify the actual running lazy/reload bundle after adding platform-specific files; a successful fresh bundle or typecheck alone does not establish preview recovery.

Treat the recorded user decisions as requirements to preserve. Implement the requested change without silently removing, redesigning, or reverting unrelated approved behavior. When the user requests a rollback, revert only the specified change. Later explicit user instructions take precedence; update the document when they change a recorded requirement.

For chat UI changes, check the relevant regression cases in that document. Distinguish type/build checks from actual visual or device checks in your report.

After creating or changing API endpoints or backend behavior, rebuild and restart the running development API when needed so it serves the updated code. Preserve its existing environment and verify the affected endpoint on the running server before reporting completion; a passing build alone is not enough.

## Sub-agent coding preference

When delegating future coding work, use `gpt-6-sol` with reasoning effort `medium` for coding sub-agents (`model: "gpt-6-sol"`, `reasoning_effort: "medium"`). The primary agent must review their changes and verification results before reporting completion.
