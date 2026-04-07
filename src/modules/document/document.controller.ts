import type { NextFunction, Request, Response } from "express";

import { apiResponse } from "../../utils/api-response";
import { documentService } from "./document.service";

const createDocument = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user?.userId) {
    res.status(401).json(apiResponse.error("Unauthorized"));
    return;
  }

  documentService
    .createDocument(req.user.userId, req.body)
    .then((result) => {
      res.status(201).json(apiResponse.success("Document created successfully", result));
    })
    .catch(next);
};

const listDocuments = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user?.userId) {
    res.status(401).json(apiResponse.error("Unauthorized"));
    return;
  }

  documentService
    .listDocuments(req.user.userId)
    .then((result) => {
      res.status(200).json(apiResponse.success("Documents fetched successfully", result));
    })
    .catch(next);
};

const removeDocument = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user?.userId) {
    res.status(401).json(apiResponse.error("Unauthorized"));
    return;
  }

  const documentId = typeof req.params.documentId === "string" ? req.params.documentId : "";

  documentService
    .deleteDocument(req.user.userId, documentId)
    .then(() => {
      res.status(200).json(apiResponse.success("Document deleted successfully", { deleted: true }));
    })
    .catch(next);
};

export { createDocument, listDocuments, removeDocument };
