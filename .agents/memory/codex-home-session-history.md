---
name: Codex home session history
description: Preserve Codex sessions when changing CODEX_HOME in the Replit workspace.
---

Treat `CODEX_HOME` as the persistent Codex state directory, including conversation history. Changing it to a different directory can make existing sessions appear missing because Codex opens a separate history store.

**Why:** Pointing a new Shell at a different Codex home made prior sessions disappear from the UI even though the old session data remained in the original home.

**How to apply:** Before changing `CODEX_HOME`, warn the user that history is stored there. Prefer temporarily pointing back to the old home to restore visibility; migrate or copy session state only with the user's direction, keeping the original intact.