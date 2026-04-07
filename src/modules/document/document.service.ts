import { Types } from "mongoose";

import { HttpError } from "../../utils/http-error";
import { DocumentChunkModel } from "./document-chunk.model";
import { enqueueDocumentProcessing } from "./document-processing.queue";
import { DocumentModel } from "./document.model";

type CreateDocumentInput = {
  name: string;
  type: "pdf" | "docx" | "ppt" | "pptx";
  sizeBytes: number;
};

type DocumentDto = {
  id: string;
  name: string;
  type: "pdf" | "docx" | "ppt" | "pptx";
  sizeBytes: number;
  status: "uploaded" | "processing" | "ready" | "failed";
  createdAt: string;
  updatedAt: string;
};

const ALLOWED_TYPES = new Set(["pdf", "docx", "ppt", "pptx"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const ensureUserId = (userId: string): Types.ObjectId => {
  if (!Types.ObjectId.isValid(userId)) {
    throw new HttpError("Invalid user identifier", 400);
  }
  return new Types.ObjectId(userId);
};

const parseCreateInput = (payload: unknown): CreateDocumentInput => {
  if (!isRecord(payload)) {
    throw new HttpError("Invalid request payload", 400);
  }

  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const type = typeof payload.type === "string" ? payload.type.trim().toLowerCase() : "";
  const sizeBytes = typeof payload.sizeBytes === "number" ? payload.sizeBytes : Number.NaN;

  if (!name) {
    throw new HttpError("Document name is required", 400);
  }
  if (!ALLOWED_TYPES.has(type)) {
    throw new HttpError("Unsupported document type", 400);
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    throw new HttpError("Invalid file size", 400);
  }

  return { name, type: type as CreateDocumentInput["type"], sizeBytes };
};

const toDocumentDto = (doc: {
  _id: Types.ObjectId;
  name: string;
  type: "pdf" | "docx" | "ppt" | "pptx";
  sizeBytes: number;
  status: "uploaded" | "processing" | "ready" | "failed";
  createdAt: Date;
  updatedAt: Date;
}): DocumentDto => ({
  id: doc._id.toString(),
  name: doc.name,
  type: doc.type,
  sizeBytes: doc.sizeBytes,
  status: doc.status,
  createdAt: doc.createdAt.toISOString(),
  updatedAt: doc.updatedAt.toISOString(),
});

const createDocument = async (userId: string, payload: unknown): Promise<{ document: DocumentDto }> => {
  const ownerId = ensureUserId(userId);
  const input = parseCreateInput(payload);

  const doc = await DocumentModel.create({
    userId: ownerId,
    name: input.name,
    type: input.type,
    sizeBytes: input.sizeBytes,
    status: "uploaded",
  });

  enqueueDocumentProcessing(doc._id.toString());

  return { document: toDocumentDto(doc) };
};

const listDocuments = async (userId: string): Promise<{ documents: DocumentDto[] }> => {
  const ownerId = ensureUserId(userId);
  const docs = await DocumentModel.find({ userId: ownerId }).sort({ createdAt: -1 }).lean();
  return { documents: docs.map(toDocumentDto) };
};

const deleteDocument = async (userId: string, documentId: string): Promise<void> => {
  const ownerId = ensureUserId(userId);
  if (!Types.ObjectId.isValid(documentId)) {
    throw new HttpError("Invalid document identifier", 400);
  }

  const deleted = await DocumentModel.findOneAndDelete({
    _id: new Types.ObjectId(documentId),
    userId: ownerId,
  })
    .select("_id")
    .lean();

  if (!deleted) {
    throw new HttpError("Document not found", 404);
  }

  await DocumentChunkModel.deleteMany({ documentId: new Types.ObjectId(documentId), userId: ownerId });
};

export const documentService = {
  createDocument,
  listDocuments,
  deleteDocument,
};
