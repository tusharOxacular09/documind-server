import { Types } from "mongoose";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";

import { DocumentChunkModel } from "./document-chunk.model";
import { DocumentModel } from "./document.model";
import { chunkText } from "./ingestion/document-chunker";
import { extractDocumentText } from "./ingestion/document-extractor";
import { createEmbedding } from "../chat/rag/openai-rag.service";
import { env } from "../../config/env";

type QueueJob = {
  documentId: string;
};
const queueName = "document-processing";
const redis = new IORedis(env.redisUrl, { maxRetriesPerRequest: null });
const queue = new Queue<QueueJob>(queueName, { connection: redis });
let worker: Worker<QueueJob> | null = null;
let workerStarted = false;
let processedTotal = 0;
let failedTotal = 0;
let retriedTotal = 0;
let inProgress = 0;

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

  const chunks: {
    userId: Types.ObjectId;
    documentId: Types.ObjectId;
    index: number;
    content: string;
    embedding?: number[];
  }[] = [];
  for (let i = 0; i < contentChunks.length; i += 1) {
    const embedding = await createEmbedding(contentChunks[i]);
    chunks.push({
      userId: doc.userId,
      documentId: doc._id,
      index: i,
      content: contentChunks[i],
      embedding: embedding ?? undefined,
    });
  }

  await DocumentChunkModel.deleteMany({ documentId: doc._id });
  if (chunks.length > 0) {
    await DocumentChunkModel.insertMany(chunks);
  }

  await markStatus(documentId, "ready");
};

const enqueueDocumentProcessing = (documentId: string): void => {
  if (!Types.ObjectId.isValid(documentId)) return;
  void queue.add("ingest", { documentId }, { jobId: documentId, attempts: 3, backoff: { type: "fixed", delay: 2000 } });
};

const startDocumentProcessingWorker = (): void => {
  if (workerStarted) return;
  workerStarted = true;
  worker = new Worker<QueueJob>(
    queueName,
    async (job) => {
      inProgress += 1;
      await processDocument(job.data.documentId);
      processedTotal += 1;
      inProgress = Math.max(0, inProgress - 1);
    },
    { connection: redis }
  );

  worker.on("failed", async (job) => {
    inProgress = Math.max(0, inProgress - 1);
    if (!job) return;
    if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await markStatus(job.data.documentId, "failed");
      failedTotal += 1;
    } else {
      retriedTotal += 1;
    }
  });
};

const getDocumentProcessingStats = async (): Promise<{
  running: boolean;
  queued: number;
  inProgress: number;
  processedTotal: number;
  failedTotal: number;
  retriedTotal: number;
}> => {
  const counts = await queue.getJobCounts("waiting", "active", "delayed");
  return {
  running: Boolean(workerStarted),
  queued: (counts.waiting ?? 0) + (counts.delayed ?? 0),
  inProgress: counts.active ?? inProgress,
  processedTotal,
  failedTotal,
  retriedTotal,
  };
};

export { enqueueDocumentProcessing, getDocumentProcessingStats, startDocumentProcessingWorker };
