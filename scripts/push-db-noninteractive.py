#!/usr/bin/env python3
"""Run drizzle-kit push in a PTY and reject advisory table truncation."""

import errno
import os
import pty
import select
import subprocess
import sys
import time


COMMAND = ["pnpm", "--filter", "@workspace/db", "run", "push-force"]
SAFE_OPTION = b"No, add the constraint without truncating the table"
TIMEOUT_SECONDS = 120


def main() -> int:
    master_fd, slave_fd = pty.openpty()
    process = subprocess.Popen(
        COMMAND,
        stdin=slave_fd,
        stdout=slave_fd,
        stderr=slave_fd,
        close_fds=True,
    )
    os.close(slave_fd)

    recent_output = b""
    deadline = time.monotonic() + TIMEOUT_SECONDS

    try:
        while process.poll() is None:
            if time.monotonic() >= deadline:
                process.terminate()
                print("\nDatabase push timed out.", file=sys.stderr)
                return 124

            readable, _, _ = select.select([master_fd], [], [], 0.25)
            if not readable:
                continue

            try:
                chunk = os.read(master_fd, 4096)
            except OSError as error:
                if error.errno == errno.EIO:
                    break
                raise

            if not chunk:
                break

            sys.stdout.buffer.write(chunk)
            sys.stdout.buffer.flush()
            recent_output = (recent_output + chunk)[-8192:]

            if SAFE_OPTION in recent_output:
                # The first selector option adds the constraint without
                # truncating the populated table.
                os.write(master_fd, b"\r")
                recent_output = b""
    finally:
        os.close(master_fd)

    return process.wait()


if __name__ == "__main__":
    raise SystemExit(main())