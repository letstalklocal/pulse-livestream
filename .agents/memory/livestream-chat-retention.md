---
name: Livestream chat retention
description: The intended retention boundary between temporary livestream chat and persistent direct messages.
---

Keep ordinary livestream chat temporary in a capped in-memory buffer. Clear it when the stream ends; do not persist it in PostgreSQL.

**Why:** The product only needs live delivery and a short buffer for late joins or brief reconnects. Permanent storage adds complexity without a desired replay or history feature.

**How to apply:** Use WebSocket delivery with the existing temporary buffer and polling as recovery. Continue persisting direct messages separately because they must survive offline sessions.