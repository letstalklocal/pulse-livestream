---
name: Agora preview handoff
description: Required cleanup when navigating from a live card preview into the full stream viewer.
---

Stop and release all active home-card Agora audience previews synchronously before navigating into the full stream viewer.

**Why:** The full viewer’s first join returned Agora error `-17` while the card preview still owned the RTC engine/channel; retrying worked only after preview cleanup completed.

**How to apply:** Keep the stream-card press handler responsible for preview cleanup before routing. Cleanup must be idempotent because the card also cleans up when it becomes invisible or unmounts.