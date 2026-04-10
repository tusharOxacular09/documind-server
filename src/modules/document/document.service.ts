/// <reference types="multer" />

import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Types } from "mongoose";

import { env } from "../../config/env";
import { HttpError } from "../../utils/http-error";
import { DocumentChunkModel } from "./document-chunk.model";
import { enqueueDocumentProcessing } from "./documind-document-processing.queue";
import { DocumentModel } from "./document.model";
import { resolvePathInsideUploads } from "./uploads-path";

type CreateDocumentInput = {
  name: string;
  type: "pdf" | "docx" | "ppt" | "pptx";
  sizeBytes: number;
};

type UploadDocumentInput = CreateDocumentInput & {
  contentBase64: string;
};

export type DocumentFileDownload = {
  absolutePath: string;
  contentType: string;
  contentDisposition: string;
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
const MAX_UPLOAD_BYTES = env.uploadMaxBytes;

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

const parseUploadInput = (payload: unknown): UploadDocumentInput => {
  const base = parseCreateInput(payload);
  if (!isRecord(payload)) {
    throw new HttpError("Invalid request payload", 400);
  }

  const contentBase64 = typeof payload.contentBase64 === "string" ? payload.contentBase64.trim() : "";
  if (!contentBase64) {
    throw new HttpError("File content is required", 400);
  }
  if (base.sizeBytes > MAX_UPLOAD_BYTES) {
    throw new HttpError(`File exceeds ${env.uploadMaxMb}MB upload limit`, 413);
  }

  return { ...base, contentBase64 };
};

const sanitizeFileName = (name: string): string =>
  name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);

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

  await enqueueDocumentProcessing(doc._id.toString());

  return { document: toDocumentDto(doc) };
};

type PersistedUploadMeta = {
  name: string;
  type: CreateDocumentInput["type"];
  sizeBytes: number;
};

const persistUploadedBuffer = async (
  ownerId: Types.ObjectId,
  meta: PersistedUploadMeta,
  fileBuffer: Buffer
): Promise<{ document: DocumentDto }> => {
  if (fileBuffer.length === 0) {
    throw new HttpError("Invalid file content", 400);
  }
  if (meta.sizeBytes > MAX_UPLOAD_BYTES) {
    throw new HttpError(`File exceeds ${env.uploadMaxMb}MB upload limit`, 413);
  }
  if (Math.abs(fileBuffer.length - meta.sizeBytes) > 2048) {
    throw new HttpError("Uploaded file size does not match metadata", 400);
  }

  const uploadsDir = path.resolve(process.cwd(), "uploads", ownerId.toString());
  await mkdir(uploadsDir, { recursive: true });

  const doc = await DocumentModel.create({
    userId: ownerId,
    name: meta.name,
    type: meta.type,
    sizeBytes: meta.sizeBytes,
    status: "uploaded",
  });

  const safeName = sanitizeFileName(meta.name);
  const filePath = path.join(uploadsDir, `${doc._id.toString()}-${safeName}`);
  await writeFile(filePath, fileBuffer);
  doc.storagePath = filePath;
  await doc.save();

  await enqueueDocumentProcessing(doc._id.toString());

  return { document: toDocumentDto(doc) };
};

const contentTypeForExt = (ext: string): string => {
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === ".pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (ext === ".ppt") return "application/vnd.ms-powerpoint";
  return "application/octet-stream";
};

/** Resolve document file on disk for download; enforces uploads-directory jail on storagePath. */
const getDocumentFileDownload = async (userId: string, documentId: string): Promise<DocumentFileDownload> => {
  const ownerId = ensureUserId(userId);
  if (!Types.ObjectId.isValid(documentId)) {
    throw new HttpError("Invalid document identifier", 400);
  }

  const doc = await DocumentModel.findOne({ _id: documentId, userId: ownerId })
    .select("_id name type storagePath userId")
    .lean();

  if (!doc) {
    throw new HttpError("Document not found", 404);
  }

  if (!doc.storagePath) {
    throw new HttpError("File not available", 404);
  }

  const absolutePath = resolvePathInsideUploads(doc.storagePath);
  if (!absolutePath) {
    throw new HttpError("Invalid file path", 403);
  }

  if (!existsSync(absolutePath)) {
    throw new HttpError("File missing on disk", 404);
  }

  const ext = path.extname(doc.name).toLowerCase();
  const contentType = contentTypeForExt(ext);
  const safeName = doc.name.replace(/[\r\n"]/g, "_");
  const contentDisposition =
    ext === ".pdf"
      ? `inline; filename="${safeName}"`
      : `attachment; filename="${safeName}"`;

  return { absolutePath, contentType, contentDisposition };
};

const createUploadedDocument = async (userId: string, payload: unknown): Promise<{ document: DocumentDto }> => {
  const ownerId = ensureUserId(userId);
  const input = parseUploadInput(payload);
  const fileBuffer = Buffer.from(input.contentBase64, "base64");
  const { name, type, sizeBytes } = input;
  return persistUploadedBuffer(ownerId, { name, type, sizeBytes }, fileBuffer);
};

const createUploadedDocumentMultipart = async (
  userId: string,
  file: Express.Multer.File
): Promise<{ document: DocumentDto }> => {
  const ownerId = ensureUserId(userId);
  const name = (file.originalname ?? "upload").trim() || "upload";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_TYPES.has(ext)) {
    throw new HttpError("Unsupported document type", 400);
  }
  const type = ext as CreateDocumentInput["type"];
  const fileBuffer = file.buffer;
  const sizeBytes = file.size;
  if (!fileBuffer?.length) {
    throw new HttpError("Invalid file content", 400);
  }
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    throw new HttpError(`File exceeds ${env.uploadMaxMb}MB upload limit`, 413);
  }
  return persistUploadedBuffer(ownerId, { name, type, sizeBytes }, fileBuffer);
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
    .select("_id storagePath")
    .lean();

  if (!deleted) {
    throw new HttpError("Document not found", 404);
  }

  await DocumentChunkModel.deleteMany({ documentId: new Types.ObjectId(documentId), userId: ownerId });
  if (deleted.storagePath) {
    const trustedPath = resolvePathInsideUploads(deleted.storagePath);
    if (trustedPath) {
      await rm(trustedPath, { force: true });
    }
  }
};

export const documentService = {
  createDocument,
  createUploadedDocument,
  createUploadedDocumentMultipart,
  getDocumentFileDownload,
  listDocuments,
  deleteDocument,
};
