---
name: Streamer overlay anchoring
description: Stable positioning rule for the streamer camera overlay and its chat.
---

Anchor the streamer’s status bar to the top safe area and its persistent action bar to the bottom safe area. Keep chat in the bottom dock directly above the action bar so messages grow upward without changing the controls’ bottom position. The user confirmed this layout works as intended.

**Why:** Flex spacers and content-sized chat containers caused the action bar to move vertically as messages arrived. Reserving more chat height made the displacement worse rather than fixing the underlying positioning.

**How to apply:** For changes to the live broadcaster screen, position the top and bottom docks independently of message height. Do not use chat height, message count, or a flexible spacer to locate persistent controls.