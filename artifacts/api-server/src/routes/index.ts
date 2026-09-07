import { Router, type IRouter } from "express";
import healthRouter from "./health";
import agoraRouter from "./agora";
import streamsRouter from "./streams";
import chatRouter from "./chat";
import directMessagesRouter from "./direct-messages";
import usersRouter from "./users";
import coinsRouter from "./coins";
import mediaPacksRouter from "./media-packs";
import postsRouter from "./posts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(agoraRouter);
router.use(streamsRouter);
router.use(chatRouter);
router.use(directMessagesRouter);
router.use(usersRouter);
router.use(coinsRouter);
router.use(mediaPacksRouter);
router.use(postsRouter);

export default router;
