import { Router } from "express";

import { authRouter } from "../modules/auth/auth.routes";

const apiRouter = Router();

apiRouter.use("/auth", authRouter);

export { apiRouter };
