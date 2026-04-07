import type { NextFunction, Request, Response } from "express";

import { apiResponse } from "../../utils/api-response";
import { chatService } from "./chat.service";

const listChats = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user?.userId) {
    res.status(401).json(apiResponse.error("Unauthorized"));
    return;
  }

  chatService
    .listChats(req.user.userId)
    .then((result) => {
      res.status(200).json(apiResponse.success("Chats fetched successfully", result));
    })
    .catch(next);
};

const getChatById = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user?.userId) {
    res.status(401).json(apiResponse.error("Unauthorized"));
    return;
  }

  const chatId = typeof req.params.chatId === "string" ? req.params.chatId : "";

  chatService
    .getChatById(req.user.userId, chatId)
    .then((result) => {
      res.status(200).json(apiResponse.success("Chat fetched successfully", result));
    })
    .catch(next);
};

const askQuestion = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user?.userId) {
    res.status(401).json(apiResponse.error("Unauthorized"));
    return;
  }

  chatService
    .askQuestion(req.user.userId, req.body)
    .then((result) => {
      res.status(200).json(apiResponse.success("Answer generated successfully", result));
    })
    .catch(next);
};

const setMessageFeedback = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user?.userId) {
    res.status(401).json(apiResponse.error("Unauthorized"));
    return;
  }

  const chatId = typeof req.params.chatId === "string" ? req.params.chatId : "";
  const messageId = typeof req.params.messageId === "string" ? req.params.messageId : "";

  chatService
    .setMessageFeedback(req.user.userId, chatId, messageId, req.body)
    .then((result) => {
      res.status(200).json(apiResponse.success("Feedback saved successfully", result));
    })
    .catch(next);
};

export { askQuestion, getChatById, listChats, setMessageFeedback };
