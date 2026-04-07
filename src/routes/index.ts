import { Router } from "express";

import { authRouter } from "../modules/auth/auth.routes";
import { documentRouter } from "../modules/document/document.routes";

const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/documents", documentRouter);

export { apiRouter };
