#!/bin/bash
set -e
pnpm install --frozen-lockfile
# drizzle-kit refuses advisory prompts without a TTY. The wrapper supplies one
# and chooses "add the constraint without truncating" when that advisory appears.
python3 scripts/push-db-noninteractive.py
