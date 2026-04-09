import { Router } from "express";

import { authenticate } from "../../middlewares/authenticate";
import {
  createDocument,
  getDocumentFile,
  listDocuments,
  processingHealth,
  removeDocument,
  uploadDocument,
  uploadDocumentMultipart,
} from "./document.controller";
import { handleMultipartFile } from "./document-upload.middleware";

const documentRouter = Router();

documentRouter.get("/processing/health", processingHealth);
documentRouter.use(authenticate);
documentRouter.post("/", createDocument);
documentRouter.post("/upload/multipart", handleMultipartFile, uploadDocumentMultipart);
documentRouter.post("/upload", uploadDocument);
documentRouter.get("/", listDocuments);
documentRouter.get("/:documentId/file", getDocumentFile);
documentRouter.delete("/:documentId", removeDocument);

export { documentRouter };
