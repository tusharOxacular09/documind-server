import { Router } from "express";

import { authenticate } from "../../middlewares/authenticate";
import { askQuestion, getChatById, listChats } from "./chat.controller";

const chatRouter = Router();

chatRouter.use(authenticate);
chatRouter.get("/", listChats);
chatRouter.get("/:chatId", getChatById);
chatRouter.post("/ask", askQuestion);

export { chatRouter };
