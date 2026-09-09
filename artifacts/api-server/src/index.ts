import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import http from "http";
import { WebSocketServer } from "ws";
import { verifyToken } from "@clerk/express";
import app from "./app";
import { logger } from "./lib/logger";
import * as wsHub from "./lib/wsHub";
import { canAccessChannel } from "./lib/privateChannelAccess";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: "/api/ws" });

wss.on("connection", (ws) => {
  let subscribedChannel: string | null = null;

  ws.on("message", async (data) => {
    try {
      const msg = JSON.parse(String(data)) as { type?: string; channelId?: string; token?: string | null };
      if (msg.type === "subscribe" && typeof msg.channelId === "string") {
        let clerkId: string | null = null;
        if (msg.token) {
          const payload = await verifyToken(msg.token, {
            secretKey: process.env["CLERK_SECRET_KEY"],
          });
          clerkId = payload.sub;
        }
        if (!await canAccessChannel(msg.channelId, clerkId)) {
          ws.send(JSON.stringify({ type: "subscription_denied" }));
          return;
        }
        if (subscribedChannel) wsHub.unsubscribe(subscribedChannel, ws);
        subscribedChannel = msg.channelId;
        const user = clerkId ? (await db.select({ uid: usersTable.uid }).from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1))[0] : null;
        wsHub.subscribe(subscribedChannel, ws, user?.uid);
      }
    } catch {
      // ignore malformed messages
    }
  });

  ws.on("close", () => {
    if (subscribedChannel) wsHub.unsubscribe(subscribedChannel, ws);
  });
});

server.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
