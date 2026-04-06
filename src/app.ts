import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";

import { apiRouter } from "./routes";
import { HttpError } from "./utils/http-error";
import { apiResponse } from "./utils/api-response";

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

app.get("/", (_req, res) => {
  res.status(200).json(apiResponse.success("Backend is running", { service: "documind-server" }));
});

app.get("/health", (_req, res) => {
  res.status(200).send("OK");
});

app.use("/api", apiRouter);

app.use((_req, res) => {
  res.status(404).json(apiResponse.error("Route not found"));
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof HttpError) {
    res.status(error.statusCode).json(apiResponse.error(error.message));
    return;
  }

  const message = error instanceof Error ? error.message : "Internal server error";
  res.status(500).json(
    apiResponse.error("Internal server error", process.env.NODE_ENV === "development" ? { message } : {})
  );
});

export { app };
