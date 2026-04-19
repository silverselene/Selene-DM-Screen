import { Router, type IRouter } from "express";
import healthRouter from "./health";
import monstersRouter from "./monsters";

const router: IRouter = Router();

router.use(healthRouter);
router.use(monstersRouter);

export default router;
