import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { contactBlocked } from "./userSafety";

export async function availableCreatorVideo(id: string, uid: number) {
  const row = (
    await db.execute(sql`select v.*, u.name as "ownerName" from creator_videos v join users u on u.uid=v.owner_user_id
    join creator_video_settings s on s.owner_user_id=v.owner_user_id
    where v.id=${id} and v.status='ready' and (v.owner_user_id=${uid} or (s.enabled and s.selected_video_id=v.id))
    and (v.owner_user_id=${uid} or not exists(select 1 from live_stream_sessions l where l.host_user_id=v.owner_user_id and l.ended_at is null and l.last_heartbeat_at > now()-interval '90 seconds'))`)
  ).rows[0] as any;
  return row && !(await contactBlocked(uid, row.owner_user_id)) ? row : null;
}
