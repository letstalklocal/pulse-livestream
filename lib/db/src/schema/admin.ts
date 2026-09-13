import {
  pgTable,
  text,
  boolean,
  timestamp,
  bigserial,
  index,
} from "drizzle-orm/pg-core";
// Staff access is separate from the ordinary Pulse users and mobile permissions.
export const adminStaffTable = pgTable("admin_staff", {
  clerkUserId: text("clerk_user_id").primaryKey(),
  role: text("role", { enum: ["owner"] }).notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const adminAuditEventsTable = pgTable(
  "admin_audit_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorClerkId: text("actor_clerk_id").notNull(),
    action: text("action").notNull(),
    target: text("target"),
    outcome: text("outcome", { enum: ["allowed", "denied"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("admin_audit_created_idx").on(t.createdAt)],
);
