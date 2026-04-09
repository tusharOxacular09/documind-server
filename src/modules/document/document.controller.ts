import type { NextFunction, Request, Response } from "express";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";

import { apiResponse } from "../../utils/api-response";
import { getDocumentProcessingStats } from "./document-processing.queue";
import { documentService } from "./document.service";
import { DocumentModel } from "./document.model";

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

const uploadDocument = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user?.userId) {
    res.status(401).json(apiResponse.error("Unauthorized"));
    return;
  }

  documentService
    .createUploadedDocument(req.user.userId, req.body)
    .then((result) => {
      res.status(201).json(apiResponse.success("Document uploaded successfully", result));
    })
    .catch(next);
};

const uploadDocumentMultipart = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user?.userId) {
    res.status(401).json(apiResponse.error("Unauthorized"));
    return;
  }
  if (!req.file) {
    res.status(400).json(apiResponse.error("Missing file (use multipart field name 'file')"));
    return;
  }

  documentService
    .createUploadedDocumentMultipart(req.user.userId, req.file)
    .then((result) => {
      res.status(201).json(apiResponse.success("Document uploaded successfully", result));
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

const processingHealth = (_req: Request, res: Response, next: NextFunction): void => {
  getDocumentProcessingStats()
    .then((worker) => {
      res.status(200).json(apiResponse.success("Document processing worker health", { worker }));
    })
    .catch(next);
};

const contentTypeForExt = (ext: string): string => {
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === ".pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (ext === ".ppt") return "application/vnd.ms-powerpoint";
  return "application/octet-stream";
};

const getDocumentFile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user?.userId) {
      res.status(401).json(apiResponse.error("Unauthorized"));
      return;
    }
    const documentId = typeof req.params.documentId === "string" ? req.params.documentId : "";
    if (!documentId) {
      res.status(400).json(apiResponse.error("Invalid document identifier"));
      return;
    }

    // Ownership enforcement: only load document scoped to current user.
    const doc = await DocumentModel.findOne({ _id: documentId, userId: req.user.userId })
      .select("_id name type storagePath userId")
      .lean();

    if (!doc) {
      // Either not found OR not owned; do not leak existence.
      res.status(404).json(apiResponse.error("Document not found"));
      return;
    }

    if (!doc.storagePath) {
      res.status(404).json(apiResponse.error("File not available"));
      return;
    }

    if (!existsSync(doc.storagePath)) {
      res.status(404).json(apiResponse.error("File missing on disk"));
      return;
    }

    const ext = path.extname(doc.name).toLowerCase();
    const contentType = contentTypeForExt(ext);
    const safeName = doc.name.replace(/[\r\n"]/g, "_");

    res.setHeader("Content-Type", contentType);

    if (ext === ".pdf") {
      res.setHeader("Content-Disposition", `inline; filename="${safeName}"`);
    } else {
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
    }

    const stream = createReadStream(doc.storagePath);
    stream.on("error", (err) => {
      console.error("Failed to stream document file", err);
      if (!res.headersSent) {
        res.status(500).json(apiResponse.error("Failed to stream file"));
      } else {
        res.end();
      }
    });
    stream.pipe(res);
  } catch (err) {
    console.error("Unhandled error serving document file", err);
    next(err);
  }
};

export {
  createDocument,
  getDocumentFile,
  listDocuments,
  processingHealth,
  removeDocument,
  uploadDocument,
  uploadDocumentMultipart,
};
