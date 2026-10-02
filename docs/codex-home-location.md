# Codex home in Replit

Codex data lives at `/home/runner/workspace/.config/codex`. New development Shell sessions must set `CODEX_HOME` to that path before starting Codex. The project ignores this directory in `.gitignore`, `.replitignore`, and `.easignore`.

On 2026-10-02, a fresh interactive `codex` process started with the managed background daemon and exited cleanly. The old top-level `codex-user` directory was absent during the test. The move had left an absolute `packages/app-server-daemon/current` symlink pointing to the old path; it was changed to a relative link to the installed 0.160.0 release. A stale `app-server-control.sock` link was also cleared so the daemon could create a new control socket.

Session database path references were updated in another session to restore previous sessions. The original data and residual old-home data were preserved under `.config/codex`; do not discard them during cleanup.

If a future Codex launch recreates `codex-user`, check `echo "$CODEX_HOME"` in that Shell before launching. If the daemon fails to start, check `packages/app-server-daemon/current` and the control socket under `.config/codex/app-server-control/`.
