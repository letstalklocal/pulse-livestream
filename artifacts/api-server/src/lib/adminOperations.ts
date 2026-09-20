import { pool } from "@workspace/db";

// Trusted SQL fragment shared by the Overview and read-only stream list.
// Aliases s and p are internal, never supplied by the client.
export const activeAdminStream = `s.ended_at IS NULL AND s.started_at <= p.as_of
  AND s.last_heartbeat_at > p.as_of - interval '60 seconds' AND s.last_heartbeat_at <= p.as_of
  AND right(s.channel_id, 5) <> '-demo'
  AND (NOT s.is_private OR EXISTS (
    SELECT 1 FROM private_stream_invitations i WHERE i.channel_id=s.channel_id
      AND i.status='active' AND i.updated_at > p.as_of - interval '75 seconds'
  ))`;

export async function readAdminStreams(
  reader: Pick<typeof pool, "query">,
  filter: string,
  cursor: number | null,
  limit: number,
  asOf = new Date(),
) {
  const result = await reader.query(
    `WITH p AS (SELECT $1::timestamptz AS as_of)
    SELECT s.id,s.host_user_id AS "hostUid",s.host_name AS "hostName",s.title,s.category,
      s.is_private AS "isPrivate",s.started_at AS "startedAt",s.last_heartbeat_at AS "lastHeartbeatAt"
    FROM live_stream_sessions s CROSS JOIN p
    WHERE ${activeAdminStream} AND ($2::integer IS NULL OR s.id<$2)
      AND ($3='all' OR ($3='private' AND s.is_private) OR ($3='public' AND NOT s.is_private))
    ORDER BY s.id DESC LIMIT $4`,
    [asOf.toISOString(), cursor, filter, limit + 1],
  );
  const rows = result.rows.slice(0, limit);
  return {
    rows,
    nextCursor: result.rows.length > limit ? String(rows.at(-1).id) : null,
    asOf: asOf.toISOString(),
  };
}

export async function readAdminReports(
  reader: Pick<typeof pool, "query">,
  kind: "stream" | "post" | "user",
  status: string,
  cursor: number | null,
  limit: number,
) {
  // Only constant table/column selections are interpolated. Report text remains data.
  const sources = {
    stream: {
      table:
        "stream_reports r JOIN live_stream_sessions s ON s.id=r.session_id",
      target: "r.session_id",
      owner: "s.host_user_id",
      source: "'stream'",
    },
    post: {
      table: "post_reports r",
      target: "r.reported_post_id",
      owner: "r.owner_user_id",
      source: "'post'",
    },
    user: {
      table: "user_reports r",
      target: "r.reported_uid",
      owner: "r.reported_uid",
      source: "r.source",
    },
  };
  const s = sources[kind];
  const result = await reader.query(
    `SELECT r.id,${s.target} AS "targetId",${s.owner} AS "ownerUid",
    ${s.source} AS source,r.reason,r.details,r.status,r.created_at AS "createdAt"
    FROM ${s.table} WHERE ($1='all' OR r.status='pending') AND ($2::integer IS NULL OR r.id<$2)
    ORDER BY r.id DESC LIMIT $3`,
    [status, cursor, limit + 1],
  );
  const rows = result.rows.slice(0, limit);
  return {
    rows,
    nextCursor: result.rows.length > limit ? String(rows.at(-1).id) : null,
    asOf: new Date().toISOString(),
  };
}
