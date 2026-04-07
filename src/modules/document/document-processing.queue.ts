import { Types } from "mongoose";

import { DocumentModel } from "./document.model";

type QueueJob = {
  documentId: string;
  attempts: number;
};

const queue: QueueJob[] = [];
const inQueue = new Set<string>();
let workerStarted = false;
let running = false;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const markStatus = async (documentId: string, status: "processing" | "ready" | "failed"): Promise<void> => {
  if (!Types.ObjectId.isValid(documentId)) return;
  await DocumentModel.findByIdAndUpdate(documentId, { status }).select("_id").lean();
};

const processDocument = async (documentId: string): Promise<void> => {
  // Simulate extraction/chunking/indexing phases to keep ingestion async and non-blocking.
  await markStatus(documentId, "processing");
  await wait(300);
  await wait(300);
  await wait(300);

  const doc = await DocumentModel.findById(documentId).select("name").lean();
  if (!doc) return;

  if (doc.name.toLowerCase().includes("corrupt")) {
    throw new Error("Document extraction failed");
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
      inQueue.delete(job.documentId);
    } catch {
      if (job.attempts < 2) {
        queue.push({ documentId: job.documentId, attempts: job.attempts + 1 });
      } else {
        await markStatus(job.documentId, "failed");
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

export { enqueueDocumentProcessing, startDocumentProcessingWorker };
