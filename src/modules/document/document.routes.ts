import { Router } from "express";

import { authenticate } from "../../middlewares/authenticate";
import { createDocument, listDocuments, processingHealth, removeDocument, uploadDocument } from "./document.controller";

const documentRouter = Router();

documentRouter.get("/processing/health", processingHealth);
documentRouter.use(authenticate);
documentRouter.post("/", createDocument);
documentRouter.post("/upload", uploadDocument);
documentRouter.get("/", listDocuments);
documentRouter.delete("/:documentId", removeDocument);

export { documentRouter };
