-- READ ONLY. Run against the production database in Replit's SQL console.
-- Reports metadata/booleans only; no recipient values, credentials or hashes.
-- This query does not retry, reset, correct, reserve, release or send anything.
WITH target AS (
 SELECT * FROM creator_withdrawals
 WHERE id='wd_9d50689c-81cb-4ba2-8ccf-02a2e722e7e3'
), issue AS (
 SELECT e.id::text event_id,e.evidence
 FROM creator_payout_events e JOIN target w ON w.id=e.withdrawal_id
 WHERE e.action IN ('unknown','expired','human_declined','reconciled',
  'preparation_lease_released_unknown','operator_browser_interrupted','recipient_error_resolved')
 ORDER BY e.id DESC LIMIT 1
), correction AS (
 SELECT e.evidence FROM creator_payout_events e JOIN target w ON w.id=e.withdrawal_id
 WHERE e.action='recipient_correction_submitted' ORDER BY e.id DESC LIMIT 1
)
SELECT w.status,w.version,
 r.user_id IS NOT NULL AS saved_recipient_exists,
 COALESCE(to_jsonb(r.revision)=w.recipient->'revision',false) AS saved_revision_matches_snapshot,
 COALESCE(r.data=(w.recipient-'revision'-'status'),false) AS saved_data_matches_snapshot,
 c.evidence IS NOT NULL AS pending_correction_exists,
 COALESCE(c.evidence->>'issueEventId'=i.event_id,false) AS correction_issue_matches,
 COALESCE(c.evidence->'recipientVersion'=to_jsonb(w.version),false) AS correction_version_matches,
 COALESCE(c.evidence->>'hash' ~ '^[a-f0-9]{64}$',false) AS correction_hash_format_valid,
 COALESCE((SELECT sum(reserved_ticks) FROM creator_cash_ledger WHERE withdrawal_id=w.id AND user_id=w.user_id),0)::text AS reserved_coins,
 (SELECT preparation_paused FROM creator_payout_settings WHERE id=1) AS preparation_paused,
 (SELECT count(*) FROM creator_payout_attempts WHERE withdrawal_id=w.id AND state IN ('unknown','expired')) AS uncertain_attempts,
 EXISTS(SELECT 1 FROM creator_payout_events WHERE withdrawal_id=w.id AND action IN ('human_release_recorded','human_declined','reconciled')) AS recorded_human_or_provider_outcome
FROM target w LEFT JOIN creator_payout_recipients r ON r.user_id=w.user_id
LEFT JOIN issue i ON true LEFT JOIN correction c ON true;
-- correction_hash_format_valid checks only format. The new scoped MCP get
-- verifies the actual canonical hash in recipientRecoveryDiagnostics, in memory.
