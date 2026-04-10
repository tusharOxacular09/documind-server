import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";

import { env } from "./config/env";
import { apiRouter } from "./routes";
import { HttpError } from "./utils/http-error";
import { apiResponse } from "./utils/api-response";

const app = express();
const jsonLimitMb = Math.max(2, Math.ceil(env.uploadMaxMb * 1.5));

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      // Non-browser clients (curl, server-to-server) often send no Origin header.
      if (!origin || env.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(morgan("dev"));
app.use(express.json({ limit: `${jsonLimitMb}mb` }));

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
  if (error instanceof Error && error.message === "Not allowed by CORS") {
    res.status(403).json(apiResponse.error(error.message));
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.statusCode).json(apiResponse.error(error.message));
    return;
  }

  const message = error instanceof Error ? error.message : "Internal server error";
  res.status(500).json(
    apiResponse.error("Internal server error", env.nodeEnv === "development" ? { message } : {})
  );
});

export { app };
