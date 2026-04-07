import { Router } from "express";

import { authRouter } from "../modules/auth/auth.routes";
import { chatRouter } from "../modules/chat/chat.routes";
import { documentRouter } from "../modules/document/document.routes";

const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/documents", documentRouter);
apiRouter.use("/chats", chatRouter);

export { apiRouter };
