---
name: Paid live session identity
description: Security invariant for paid live admission, reconnects, and Agora token issuance.
---

Paid admission must be tied to an immutable, durable live-session identity rather than only a reusable channel string or an in-memory active-stream record. Create that session before issuing any Agora token, and make token authorization fail closed when no active persisted session exists.

**Why:** Volatile state creates a startup/restart window where tokens can bypass payment, while reusable channel identifiers can accidentally carry an old viewer entitlement into a later live.

**How to apply:** Any paid live mode, admission lookup, reconnect path, or token endpoint must use the persisted session identity. A viewer entitlement remains valid for that session only, so reconnects are free without granting access to a future live.