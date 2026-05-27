import http from "http";
import { WebSocketServer } from "ws";
import app from "./app";
import { logger } from "./lib/logger";
import * as wsHub from "./lib/wsHub";

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

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(String(data)) as { type?: string; channelId?: string };
      if (msg.type === "subscribe" && typeof msg.channelId === "string") {
        if (subscribedChannel) wsHub.unsubscribe(subscribedChannel, ws);
        subscribedChannel = msg.channelId;
        wsHub.subscribe(subscribedChannel, ws);
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
