import { Router } from "express";

const router = Router();

interface ChatMessage {
  id: string;
  senderName: string;
  text: string;
  color: string;
  ts: number;
}

const chatStore = new Map<string, ChatMessage[]>();
const MAX_MESSAGES = 200;

export function clearChat(channelId: string) {
  chatStore.delete(channelId);
}

router.get("/streams/:channelId/chat", (req, res) => {
  const channelId = req.params["channelId"] ?? "";
  const since = parseInt(req.query["since"] as string ?? "0", 10) || 0;
  const all = chatStore.get(channelId) ?? [];
  const messages = since > 0 ? all.filter((m) => m.ts > since) : all;
  res.json({ messages });
});

router.post("/streams/:channelId/chat", (req, res) => {
  const channelId = req.params["channelId"] ?? "";
  const { senderName, text, color } = req.body as {
    senderName?: string;
    text?: string;
    color?: string;
  };

  if (!text?.trim()) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  const message: ChatMessage = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    senderName: senderName?.trim() || "Viewer",
    text: text.trim(),
    color: color ?? "#FF1966",
    ts: Date.now(),
  };

  const existing = chatStore.get(channelId) ?? [];
  const updated = [...existing, message].slice(-MAX_MESSAGES);
  chatStore.set(channelId, updated);

  res.json({ message });
});

export default router;
