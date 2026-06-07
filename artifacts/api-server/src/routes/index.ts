import { Router, type IRouter } from "express";
import healthRouter from "./health";
import agoraRouter from "./agora";
import streamsRouter from "./streams";
import chatRouter from "./chat";
import usersRouter from "./users";
import coinsRouter from "./coins";
import dmRouter from "./dm";

const router: IRouter = Router();

router.use(healthRouter);
router.use(agoraRouter);
router.use(streamsRouter);
router.use(chatRouter);
router.use(usersRouter);
router.use(coinsRouter);
router.use(dmRouter);

export default router;
