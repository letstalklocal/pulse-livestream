# Project instructions

Before changing direct messages, chat UI, keyboard/composer behavior, message status indicators, replies, or message preferences, read [docs/chat-message-preferences.md](docs/chat-message-preferences.md).

Treat the recorded user decisions as requirements to preserve. Implement the requested change without silently removing, redesigning, or reverting unrelated approved behavior. When the user requests a rollback, revert only the specified change. Later explicit user instructions take precedence; update the document when they change a recorded requirement.

For chat UI changes, check the relevant regression cases in that document. Distinguish type/build checks from actual visual or device checks in your report.

After creating or changing API endpoints or backend behavior, rebuild and restart the running development API when needed so it serves the updated code. Preserve its existing environment and verify the affected endpoint on the running server before reporting completion; a passing build alone is not enough.
