---
name: Private live payment escrow
description: Payment and refund invariant for paid private one-to-one livestream invitations.
---

Paid private invitations must debit the recipient into invitation-scoped escrow, not immediately credit the streamer. Release escrow only after a matching durable private live session exists and the invitation becomes active. If it remains unstarted for five minutes, or is cancelled before starting, refund escrow exactly once.

**Why:** Immediate streamer credit makes refunds depend on the streamer retaining enough balance and allows a start request without a delivered stream to capture payment. Escrow guarantees the recipient can always be refunded and keeps start-versus-refund races deterministic.

**How to apply:** Bind hold, settlement, and refund ledger entries to the immutable invitation identity with unique idempotency keys and serialize transitions with a database lock. For credits, successfully claim the unique ledger key before changing the balance so ledger uniqueness remains a second line of defense if locking regresses. A paid start must verify the matching unended durable private session before settlement.