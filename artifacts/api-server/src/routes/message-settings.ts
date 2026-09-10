import { Router } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { db, messagePreferencesTable, directMessagesTable, usersTable } from "@workspace/db";
import { requireContactAllowed } from "../lib/userSafety";
import { authenticatedUser } from "../lib/streamModeration";
import { chatNeedsGift, messagePreferences } from "../lib/messagePreferences";
const router=Router();
router.get("/message-settings",async(req,res)=>{
 const user=await authenticatedUser(req);if(!user)return void res.status(401).json({error:"Sign in to manage messages."});
 res.set("Cache-Control","no-store").json(await messagePreferences(user.uid));
});
router.patch("/message-settings",async(req,res)=>{
 const user=await authenticatedUser(req);if(!user)return void res.status(401).json({error:"Sign in to manage messages."});
 const patch=req.body;
 if(!patch || typeof patch!=="object" || Array.isArray(patch) || !Object.keys(patch).length || Object.entries(patch).some(([key,value])=>!["lastSeenOnline","readReceipts","giftToOpenChat"].includes(key)||typeof value!=="boolean"))return void res.status(400).json({error:"Invalid message settings."});
 await db.insert(messagePreferencesTable).values({userId:user.uid,...patch}).onConflictDoUpdate({target:messagePreferencesTable.userId,set:patch});
 res.json(await messagePreferences(user.uid));
});
router.post("/messages/presence",async(req,res)=>{
 const user=await authenticatedUser(req);if(!user)return void res.status(401).json({error:"Sign in required."});
 await db.insert(messagePreferencesTable).values({userId:user.uid,lastActiveAt:new Date()}).onConflictDoUpdate({target:messagePreferencesTable.userId,set:{lastActiveAt:new Date()}});
 res.json({success:true});
});
router.get("/messages/peers/:uid",async(req,res)=>{
 const user=await authenticatedUser(req);if(!user)return void res.status(401).json({error:"Sign in required."});
 const uid=Number(req.params.uid);if(!Number.isSafeInteger(uid)||uid<=0||uid>2147483647)return void res.status(400).json({error:"Invalid account."});
 if(!await requireContactAllowed(res,user.uid,uid))return;
 if(!(await db.select({uid:usersTable.uid}).from(usersTable).where(eq(usersTable.uid,uid)))[0])return void res.status(404).json({error:"Account not found."});
 const [row]=await db.select().from(messagePreferencesTable).where(eq(messagePreferencesTable.userId,uid));
 const lastSeen=row?.lastSeenOnline ? row.lastActiveAt?.getTime()??null : null;
 res.set("Cache-Control","no-store").json({lastSeen,online:lastSeen!==null&&Date.now()-lastSeen<45000,needsGift:await chatNeedsGift(user.uid,uid),requiredGiftId:"rose"});
});
router.post("/messages/peers/:uid/read",async(req,res)=>{
 const user=await authenticatedUser(req);if(!user)return void res.status(401).json({error:"Sign in required."});
 const uid=Number(req.params.uid);if(!Number.isSafeInteger(uid)||uid<=0||uid>2147483647)return void res.status(400).json({error:"Invalid account."});
 await db.update(directMessagesTable).set({readAt:new Date()}).where(and(eq(directMessagesTable.fromUserId,uid),eq(directMessagesTable.toUserId,user.uid),isNull(directMessagesTable.readAt)));
 res.json({success:true});
});
export default router;
