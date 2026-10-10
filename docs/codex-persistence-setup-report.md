# Codex persistence setup in this Replit

Inspected October 10, 2026. Credentials, tokens, session contents, and session identifiers are omitted. This was a read-only inspection; no restart/reset test was performed.

## How persistence works

Codex stores its state in `/home/runner/workspace/.config/codex`, on the Replit workspace's Btrfs mount. It does not use `/home/runner/.codex`, which does not exist in this environment.

Observed mounts:

```text
/home/runner            overlay filesystem
/home/runner/workspace  /dev/vde[/working_subv], Btrfs
```

The mount evidence supports workspace-based persistence. Retention across resets was not independently tested during this inspection.

## Effective environment and configuration

All inspected running Codex processes inherit:

```text
HOME=/home/runner
CODEX_HOME=/home/runner/workspace/.config/codex
XDG_CONFIG_HOME=/home/runner/workspace/.config
XDG_DATA_HOME=/home/runner/workspace/.local/share
```

Two files explicitly configure `CODEX_HOME`.

In `/home/runner/workspace/.replit`:

```toml
[userenv.development]
CODEX_HOME = "/home/runner/workspace/.config/codex"
```

In `/home/runner/workspace/.config/bashrc`:

```bash
# Keep Codex runtime data out of the project root in interactive Replit Shells.
export CODEX_HOME=/home/runner/workspace/.config/codex
```

Replit's `/home/runner/.bashrc` sources the project-local hook for interactive shells when `REPLIT_MODE` is unset. `/home/runner/.profile` loads `/home/runner/.bashrc`.

The project's `docs/codex-home-location.md` records that Replit's compiled shell environment previously retained an old value after `.replit` changed. The project-local shell hook supplied the correct value in newly opened interactive shells.

Official OpenAI documentation confirms that Codex stores local state under `CODEX_HOME`, whose default is `~/.codex`:

https://learn.chatgpt.com/docs/config-file/config-advanced#config-and-state-locations

## Session transcripts and databases

All paths in this table are relative to `/home/runner/workspace/.config/codex/`.

| Data | Observed location |
| --- | --- |
| Session transcripts | `sessions/` — 390 JSONL files |
| Archived transcripts | `archived_sessions/` — 3 JSONL files |
| History | `history.jsonl` |
| Session index | `session_index.jsonl` |
| Runtime databases | `state_5.sqlite`, `thread_history_1.sqlite`, `goals_1.sqlite`, `memories_1.sqlite`, `queue_1.sqlite`, `logs_2.sqlite` |
| SQLite companion files | Corresponding `-wal` and `-shm` files |
| Configuration | `config.toml` |

The running CLI and daemon have databases open at these paths. A read-only aggregate check found 393 thread transcript references pointing to the current home, with none pointing to `/home/runner/.codex` or the former `/home/runner/workspace/codex-user` directory. No transcript contents were read for this check.

Database filenames and versions are observations of this installation, not configuration requirements for other Codex versions.

## Symlinks and backup/restore scripts

The Codex home, its parent path components, the transcript directories, and the inspected database files are not symlinks. They reside directly on the workspace mount.

Internal runtime symlinks exist:

- `packages/app-server-daemon/current` selects the installed daemon release, currently `0.162.0-x86_64-unknown-linux-musl` under the same Codex home.
- The daemon control socket symlink points into `/tmp/codex-daemon-1000/`.

These runtime links do not provide transcript persistence.

No Codex startup backup/restore script was found in the inspected project startup settings, scripts, or relevant service locations. Preserved recovery directories and a database backup exist from an October 2 migration. The project documentation records manual database path repairs during that move; these are historical recovery artifacts, not an observed automatic restore mechanism.

## Launch command and startup settings

The observed interactive launch is:

```bash
codex
```

The launcher path is:

```text
/home/runner/workspace/.config/npm/node_global/bin/codex
```

It is a symlink to the `@openai/codex` JavaScript launcher at:

```text
/home/runner/workspace/.config/npm/node_global/lib/node_modules/@openai/codex/bin/codex.js
```

The installed npm package version is `0.161.0`. The launcher starts a native Codex executable. The managed daemon currently runs release `0.162.0` with these arguments:

```bash
codex app-server --listen unix:// --analytics-default-enabled --managed-daemon
```

The `.replit` file contains no Codex launch workflow or persistence startup command. Its relevant environment setting is the `CODEX_HOME` entry shown above. Other observed startup settings include:

```toml
[workflows]
runButton = "Project"

[postMerge]
path = "scripts/post-merge.sh"
timeoutMs = 20000
```

The post-merge script contains:

```bash
#!/bin/bash
set -e
pnpm install --frozen-lockfile
# drizzle-kit refuses advisory prompts without a TTY. The wrapper supplies one
# and chooses "add the constraint without truncating" when that advisory appears.
python3 scripts/push-db-noninteractive.py
```

It installs project dependencies and updates the application database; it does not restore Codex state. There is no `replit.nix` in this workspace.

## Reproduce the setup in another Replit

These steps configure a fresh Codex home in a Replit using `/home/runner/workspace` as its persistent workspace. If existing sessions must be retained, read the migration notes below before launching with the new home.

1. Create the state directory:

   ```bash
   mkdir -p /home/runner/workspace/.config/codex
   chmod 700 /home/runner/workspace/.config/codex
   ```

2. Add or update the following section in `/home/runner/workspace/.replit`. Merge it into an existing table rather than creating duplicate TOML tables:

   ```toml
   [userenv.development]
   CODEX_HOME = "/home/runner/workspace/.config/codex"
   ```

3. Add the following line to `/home/runner/workspace/.config/bashrc`, preserving any existing contents:

   ```bash
   export CODEX_HOME=/home/runner/workspace/.config/codex
   ```

4. Match this project's exclusions. Add to `.gitignore`:

   ```text
   /.config/codex/
   ```

   Add to `.replitignore` and `.easignore`, if used:

   ```text
   .config/codex/
   ```

5. Close existing Codex processes and their managed daemon. Open a new Replit Shell, verify the home and its mount, then launch:

   ```bash
   printf '%s\n' "$CODEX_HOME"
   findmnt -T "$CODEX_HOME" -o TARGET,SOURCE,FSTYPE
   codex
   ```

   The printed home should be `/home/runner/workspace/.config/codex`. Its mount should be the persistent workspace mount. If a launcher does not load the interactive shell hook, explicitly supply the environment variable:

   ```bash
   CODEX_HOME=/home/runner/workspace/.config/codex codex
   ```

   Other launch mechanisms must inherit the same `CODEX_HOME`.

6. Create a harmless test session and exit. Restart the Replit environment, open a new shell, verify `CODEX_HOME` again, and check that the session appears with:

   ```bash
   codex resume
   ```

## Existing-session migration notes

Changing `CODEX_HOME` alone opens a separate history store. It does not move sessions from `/home/runner/.codex`.

Before relocating an existing home:

- Stop both the Codex CLI and its managed daemon so the state is no longer changing.
- Preserve the original directory and copy the complete home consistently, including databases and SQLite companion files. Avoid merging two independently used homes blindly.
- Check for absolute transcript paths and daemon symlinks that still point to the previous location. This environment previously required transcript-path repairs after relocation.
- A compatibility symlink at the old path can preserve old transcript references, but it must be recreated after any reset that removes `/home/runner` contents. This environment does not currently use such a home symlink.
- Verify that existing sessions can actually be resumed before discarding any original state or recovery copies.

The ignore rules exclude Codex state from Git and deployment images. Workspace persistence does not make a Git clone or deployment a backup of sessions. A reset that also removes the workspace requires a separate backup to recover them.
