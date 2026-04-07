import { app } from "./app";
import { connectDatabase } from "./config/database";
import { env } from "./config/env";
import { startDocumentProcessingWorker } from "./modules/document/document-processing.queue";

const startServer = async (): Promise<void> => {
  try {
    await connectDatabase(env.mongoUri, env.mongodbDbName);
    startDocumentProcessingWorker();
    app.listen(env.port, () => {
      console.log(`DocuMind server listening on port ${env.port}`);
    });
  } catch (error) {
    console.error("Failed to start server", error);
    process.exit(1);
  }
};

void startServer();
