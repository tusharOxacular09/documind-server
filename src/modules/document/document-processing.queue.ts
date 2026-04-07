import { Types } from "mongoose";

import { DocumentChunkModel } from "./document-chunk.model";
import { DocumentModel } from "./document.model";
import { chunkText } from "./ingestion/document-chunker";
import { extractDocumentText } from "./ingestion/document-extractor";

type QueueJob = {
  documentId: string;
  attempts: number;
};

const queue: QueueJob[] = [];
const inQueue = new Set<string>();
let workerStarted = false;
let running = false;
let processedTotal = 0;
let failedTotal = 0;
let retriedTotal = 0;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const markStatus = async (documentId: string, status: "processing" | "ready" | "failed"): Promise<void> => {
  if (!Types.ObjectId.isValid(documentId)) return;
  await DocumentModel.findByIdAndUpdate(documentId, { status }).select("_id").lean();
};

const processDocument = async (documentId: string): Promise<void> => {
  // Extraction -> chunking -> persistence pipeline.
  await markStatus(documentId, "processing");
  await wait(300);

  const doc = await DocumentModel.findById(documentId).select("name type userId storagePath sizeBytes").lean();
  if (!doc) return;

  if (doc.name.toLowerCase().includes("corrupt")) {
    throw new Error("Document extraction failed");
  }

  const extractedText = await extractDocumentText({
    name: doc.name,
    type: doc.type,
    storagePath: doc.storagePath,
    sizeBytes: doc.sizeBytes,
  });
  await wait(300);

  const contentChunks = chunkText({
    text: extractedText,
    chunkSize: 90,
    overlap: 20,
  });
  await wait(300);

  const chunks: { userId: Types.ObjectId; documentId: Types.ObjectId; index: number; content: string }[] = [];
  for (let i = 0; i < contentChunks.length; i += 1) {
    chunks.push({
      userId: doc.userId,
      documentId: doc._id,
      index: i,
      content: contentChunks[i],
    });
  }

  await DocumentChunkModel.deleteMany({ documentId: doc._id });
  if (chunks.length > 0) {
    await DocumentChunkModel.insertMany(chunks);
  }

  await markStatus(documentId, "ready");
};

const runLoop = async (): Promise<void> => {
  if (running) return;
  running = true;

  while (queue.length > 0) {
    const job = queue.shift();
    if (!job) continue;

    try {
      await processDocument(job.documentId);
      processedTotal += 1;
      inQueue.delete(job.documentId);
    } catch {
      if (job.attempts < 2) {
        retriedTotal += 1;
        queue.push({ documentId: job.documentId, attempts: job.attempts + 1 });
      } else {
        await markStatus(job.documentId, "failed");
        failedTotal += 1;
        inQueue.delete(job.documentId);
      }
    }
  }

  running = false;
};

const enqueueDocumentProcessing = (documentId: string): void => {
  if (!Types.ObjectId.isValid(documentId)) return;
  if (inQueue.has(documentId)) return;

  inQueue.add(documentId);
  queue.push({ documentId, attempts: 0 });
  void runLoop();
};

const startDocumentProcessingWorker = (): void => {
  if (workerStarted) return;
  workerStarted = true;
  // Keep queue draining if jobs arrive while idle.
  setInterval(() => {
    void runLoop();
  }, 1000);
};

const getDocumentProcessingStats = (): {
  running: boolean;
  queued: number;
  inProgress: number;
  processedTotal: number;
  failedTotal: number;
  retriedTotal: number;
} => ({
  running,
  queued: queue.length,
  inProgress: Math.max(0, inQueue.size - queue.length),
  processedTotal,
  failedTotal,
  retriedTotal,
});

export { enqueueDocumentProcessing, getDocumentProcessingStats, startDocumentProcessingWorker };
