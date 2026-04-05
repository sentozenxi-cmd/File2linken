import { Router, type IRouter } from "express";
import healthRouter from "./health";
import filesRouter from "./files";
import homeRouter from "./home";

const router: IRouter = Router();

router.use(healthRouter);
router.use(filesRouter);

export default router;

export { homeRouter };
