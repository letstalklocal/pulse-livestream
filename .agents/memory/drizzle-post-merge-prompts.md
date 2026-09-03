---
name: Drizzle post-merge prompts
description: Safe handling for drizzle-kit unique-constraint prompts in noninteractive post-merge setup.
---

Drizzle-kit 0.31 can show a unique-constraint advisory even with `push --force`.
That advisory refuses piped stdin when no TTY is present, and input sent before
the selector renders is discarded. Run the push through a PTY and confirm only
after the non-truncating selector option is rendered.

**Why:** Post-merge setup runs without a TTY. A plain pipe still fails, while
blindly selecting truncation could delete populated application data.

**How to apply:** Keep automated schema setup noninteractive and explicitly
select “add the constraint without truncating.” Treat any other unexpected
prompt as a failure rather than auto-approving it.