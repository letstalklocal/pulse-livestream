import { pool } from "@workspace/db";
import { verificationEnvironment } from "./didit";

/** All subqueries share one PostgreSQL statement snapshot. Timestamp-without-zone
 * account/ledger fields are interpreted as UTC, matching their existing storage.
 * Prior comparison is the immediately preceding interval of equal duration.
 */
export async function readAdminOverview(
  reader: Pick<typeof pool, "query"> = pool,
  asOf = new Date(),
  providerEnvironment = verificationEnvironment(),
) {
  const result = await reader.query(
    `
    WITH bounds AS (
      SELECT $1::timestamptz AS as_of,
        $1::timestamptz AT TIME ZONE 'UTC' AS end_utc,
        date_trunc('day', $1::timestamptz AT TIME ZONE 'UTC') - interval '6 days' AS start_utc
    ), periods AS (
      SELECT *, start_utc - (end_utc - start_utc) AS previous_start FROM bounds
    ), account_counts AS (
      SELECT count(*) AS total,
        count(*) FILTER (WHERE u.created_at >= p.start_utc) AS current_new,
        count(*) FILTER (WHERE u.created_at >= p.previous_start AND u.created_at < p.start_utc) AS previous_new,
        count(*) FILTER (WHERE v.is_verified = true) AS verified
      FROM periods p JOIN users u ON u.created_at < p.end_utc
      LEFT JOIN identity_verifications v ON v.user_id = u.uid AND v.environment = $2
    ), gift_counts AS (
      SELECT COALESCE(sum(t.amount) FILTER (WHERE t.created_at >= p.start_utc), 0) AS current_gifts,
        COALESCE(sum(t.amount) FILTER (WHERE t.created_at < p.start_utc), 0) AS previous_gifts
      FROM periods p JOIN coin_transactions t ON t.created_at >= p.previous_start AND t.created_at < p.end_utc
      WHERE t.type = 'gift'
    ), daily AS (
      SELECT to_char(d.day, 'YYYY-MM-DD') AS date, count(u.uid)::integer AS count
      FROM periods p
      CROSS JOIN LATERAL generate_series(p.start_utc, date_trunc('day',p.end_utc), interval '1 day') d(day)
      LEFT JOIN users u ON u.created_at >= d.day AND u.created_at < d.day + interval '1 day' AND u.created_at < p.end_utc
      GROUP BY d.day
    )
    SELECT a.total, a.verified, a.current_new, a.previous_new, g.current_gifts, g.previous_gifts,
      (SELECT count(*) FROM live_stream_sessions s
        WHERE s.ended_at IS NULL AND s.started_at <= p.as_of
          AND s.last_heartbeat_at > p.as_of - interval '60 seconds' AND s.last_heartbeat_at <= p.as_of
          AND right(s.channel_id, 5) <> '-demo'
          AND (NOT s.is_private OR EXISTS (
            SELECT 1 FROM private_stream_invitations i WHERE i.channel_id=s.channel_id
              AND i.status='active' AND i.updated_at > p.as_of - interval '75 seconds'
          ))) AS live_streams,
      to_char(p.start_utc, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS range_start,
      to_char(p.previous_start, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS previous_start,
      (SELECT json_agg(daily ORDER BY date) FROM daily) AS growth
    FROM periods p CROSS JOIN account_counts a CROSS JOIN gift_counts g
  `,
    [asOf.toISOString(), providerEnvironment],
  );
  const row = result.rows[0];
  const number = (value: unknown) => {
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < 0)
      throw new Error("Invalid overview aggregate");
    return n;
  };
  const compare = (currentValue: unknown, previousValue: unknown) => {
    const current = number(currentValue),
      previous = number(previousValue);
    return {
      current,
      previous,
      changePercent:
        previous === 0
          ? null
          : Math.round(((current - previous) / previous) * 1000) / 10,
    };
  };
  const totalUsers = number(row.total),
    verifiedAccounts = number(row.verified);
  return {
    asOf: asOf.toISOString(),
    environment:
      process.env.NODE_ENV === "production" ? "production" : "development",
    verificationEnvironment: providerEnvironment,
    range: {
      start: row.range_start as string,
      end: asOf.toISOString(),
      previousStart: row.previous_start as string,
      previousEnd: row.range_start as string,
      timeZone: "UTC" as const,
      todayPartial: true,
    },
    totalUsers,
    verifiedAccounts,
    verifiedPercent: totalUsers
      ? Math.round((verifiedAccounts / totalUsers) * 1000) / 10
      : 0,
    liveStreams: number(row.live_streams),
    newUsers: compare(row.current_new, row.previous_new),
    coinsGifted: compare(row.current_gifts, row.previous_gifts),
    growth: (row.growth as { date: string; count: number }[]).map((d) => ({
      date: d.date,
      count: number(d.count),
    })),
  };
}
