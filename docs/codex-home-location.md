# Codex home in Replit

Codex data lives at `/home/runner/workspace/.config/codex`. Interactive Replit Shells now set `CODEX_HOME` to that path through the project-local `.config/bashrc` hook, so a manual `export` is not needed in a newly opened Shell tab. The project ignores this directory in `.gitignore`, `.replitignore`, and `.easignore`.

On 2026-10-02, a fresh interactive `codex` process started with the managed background daemon and exited cleanly. The old top-level `codex-user` directory was absent during the test. The move had left an absolute `packages/app-server-daemon/current` symlink pointing to the old path; it was changed to a relative link to the installed 0.160.0 release. A stale `app-server-control.sock` link was also cleared so the daemon could create a new control socket.

Session database path references were updated in another session to restore previous sessions. The original data and residual old-home data were preserved under `.config/codex`; do not discard them during cleanup.

If a future Codex launch recreates `codex-user`, check `echo "$CODEX_HOME"` in that Shell before launching. If the daemon fails to start, check `packages/app-server-daemon/current` and the control socket under `.config/codex/app-server-control/`.

On 2026-10-02, `.replit` contained `[userenv.development] CODEX_HOME` with the new path, but Replit's compiled Shell environment still supplied the old path. A simulated fresh interactive Shell that inherited the old value loaded `.config/bashrc` and returned the new value. If a future Shell still shows the old path, check that this local hook exists and is loaded.
