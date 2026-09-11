import { Router } from "express";
import { getAuth } from "@clerk/express";
import { eq, sql } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { performanceSummary } from "../lib/performance";

const router = Router();
router.get("/performance", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId)
    return void res.status(401).json({ error: "Authentication required" });
  const timezone =
    typeof req.query.timezone === "string" ? req.query.timezone : "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch {
    return void res.status(400).json({ error: "Invalid time zone" });
  }
  const [owner] = await db
    .select({ uid: usersTable.uid })
    .from(usersTable)
    .where(eq(usersTable.clerkId, clerkId))
    .limit(1);
  if (!owner) return void res.status(404).json({ error: "Account not found" });
  // PostgreSQL resolves local midnights independently, including daylight-saving transitions.
  const calendar = await db.execute<{
    date: string;
    start: string;
    end: string;
    today: string;
  }>(sql`
    select to_char(day, 'YYYY-MM-DD') as date,
      extract(epoch from (day at time zone ${timezone})) * 1000 as start,
      extract(epoch from ((day + interval '1 day') at time zone ${timezone})) * 1000 as end,
      to_char(now() at time zone ${timezone}, 'YYYY-MM-DD') as today
    from generate_series(date_trunc('month', now() at time zone ${timezone}),
      date_trunc('month', now() at time zone ${timezone}) + interval '1 month' - interval '1 day', interval '1 day') as day
  `);
  const days = calendar.rows.map((day) => ({
    date: day.date,
    start: Number(day.start),
    end: Number(day.end),
  }));
  const start = new Date(days[0]!.start).toISOString();
  const end = new Date(days[days.length - 1]!.end).toISOString();
  const sessions = await db.execute<{ start: string; end: string }>(sql`
    select extract(epoch from started_at) * 1000 as start,
      extract(epoch from least(case when ended_at <= last_heartbeat_at + interval '60 seconds' then ended_at else last_heartbeat_at end, now())) * 1000 as end
    from live_stream_sessions
    where host_user_id = ${owner.uid} and started_at < ${end}::timestamptz
      and coalesce(ended_at, last_heartbeat_at) > ${start}::timestamptz
    union all
    select extract(epoch from (h.started_at at time zone 'UTC')) * 1000 as start,
      extract(epoch from least(h.ended_at at time zone 'UTC', now())) * 1000 as end
    from stream_history h
    where h.host_uid = ${owner.uid} and h.ended_at is not null
      and h.started_at < (${end}::timestamptz at time zone 'UTC')
      and h.ended_at > (${start}::timestamptz at time zone 'UTC')
      and not exists (select 1 from live_stream_sessions s where s.channel_id = h.channel_id)
  `);
  const summary = performanceSummary(
    days,
    sessions.rows.map((s) => ({ start: Number(s.start), end: Number(s.end) })),
    calendar.rows[0]!.today,
  );
  const earnings = await db.execute<{ coins: string }>(sql`
    select coalesce(sum(amount), 0) as coins from coin_transactions
    where to_user_id = ${owner.uid} and type = 'gift' and channel_id is not null and channel_id <> ''
      and created_at >= (${start}::timestamptz at time zone 'UTC')
      and created_at < (${end}::timestamptz at time zone 'UTC')
      and created_at <= (now() at time zone 'UTC')
  `);
  const liveCoins = Number(earnings.rows[0]?.coins ?? 0);
  res.json({
    timezone,
    today: calendar.rows[0]!.today,
    month: days[0]!.date.slice(0, 7),
    ...summary,
    liveCoins,
    bonusCoins: Math.floor((liveCoins * summary.level.bonusPercent) / 100),
  });
});
export default router;
