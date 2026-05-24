import { Router, type IRouter } from "express";
import healthRouter from "./health";
import agoraRouter from "./agora";
import streamsRouter from "./streams";
import usersRouter from "./users";
import coinsRouter from "./coins";

const router: IRouter = Router();

router.use(healthRouter);
router.use(agoraRouter);
router.use(streamsRouter);
router.use(usersRouter);
router.use(coinsRouter);

export default router;
