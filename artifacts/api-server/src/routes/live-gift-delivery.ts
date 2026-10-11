import { Router } from "express";
import { liveGiftDeliveryState, refreshLiveGiftDelivery, setLiveGiftDelivery } from "../lib/liveGiftDelivery";

// Mounted only after the existing enabled-owner admin guard.
export const adminLiveGiftDeliveryRouter = Router();
adminLiveGiftDeliveryRouter.get("/", async (_req, res) => {
  await refreshLiveGiftDelivery(); res.json(liveGiftDeliveryState());
});
adminLiveGiftDeliveryRouter.put("/", async (req, res) => {
  if (typeof req.body?.enabled !== "boolean" || Object.keys(req.body).some(k => k !== "enabled")) {
    res.status(400).json({ error: "Choose On or Off." }); return;
  }
  try { res.json(await setLiveGiftDelivery(req.body.enabled, res.locals.adminId)); }
  catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : "Could not change delivery. Current setting retained." }); }
});
