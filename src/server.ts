import { app } from "./app";
import { connectDatabase } from "./config/database";
import { env } from "./config/env";
import { startDocumentProcessingWorker } from "./modules/document/document-processing.queue";

const startServer = async (): Promise<void> => {
  try {
    await connectDatabase(env.mongoUri, env.mongodbDbName);
    if (env.processorMode === "all" || env.processorMode === "worker") {
      startDocumentProcessingWorker();
    }
    if (env.processorMode === "all" || env.processorMode === "api") {
      app.listen(env.port, () => {
        console.log(`DocuMind server listening on port ${env.port}`);
      });
    } else {
      console.log("DocuMind worker mode started");
    }
  } catch (error) {
    console.error("Failed to start server", error);
    process.exit(1);
  }
};

void startServer();
