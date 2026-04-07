import { Router } from "express";

import { authenticate } from "../../middlewares/authenticate";
import { createDocument, listDocuments, removeDocument, uploadDocument } from "./document.controller";

const documentRouter = Router();

documentRouter.use(authenticate);
documentRouter.post("/", createDocument);
documentRouter.post("/upload", uploadDocument);
documentRouter.get("/", listDocuments);
documentRouter.delete("/:documentId", removeDocument);

export { documentRouter };
