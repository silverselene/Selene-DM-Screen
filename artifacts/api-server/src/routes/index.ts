import { Router, type IRouter } from "express";
import healthRouter from "./health";
import monstersRouter from "./monsters";
import charactersRouter from "./characters";
import weaponsRouter from "./weapons";

const router: IRouter = Router();

router.use(healthRouter);
router.use(monstersRouter);
router.use(charactersRouter);
router.use(weaponsRouter);

export default router;
