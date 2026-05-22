import { Router, type IRouter } from "express";
import healthRouter from "./health";
import agoraRouter from "./agora";
import streamsRouter from "./streams";

const router: IRouter = Router();

router.use(healthRouter);
router.use(agoraRouter);
router.use(streamsRouter);

export default router;
