import { Router } from "express";

import { authenticate } from "../../middlewares/authenticate";
import { createDocument, listDocuments, removeDocument } from "./document.controller";

const documentRouter = Router();

documentRouter.use(authenticate);
documentRouter.post("/", createDocument);
documentRouter.get("/", listDocuments);
documentRouter.delete("/:documentId", removeDocument);

export { documentRouter };
