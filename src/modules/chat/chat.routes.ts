import { Router } from "express";

import { authenticate } from "../../middlewares/authenticate";
import { askQuestion, getChatById, listChats, setMessageFeedback } from "./chat.controller";

const chatRouter = Router();

chatRouter.use(authenticate);
chatRouter.get("/", listChats);
chatRouter.get("/:chatId", getChatById);
chatRouter.post("/ask", askQuestion);
chatRouter.post("/:chatId/messages/:messageId/feedback", setMessageFeedback);

export { chatRouter };
