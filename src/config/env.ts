import dotenv from "dotenv";

dotenv.config();

const mongoUri = process.env.MONGODB_URI?.trim() ?? "";
const mongodbDbName = process.env.MONGODB_DB_NAME?.trim() ?? "";

const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET?.trim() ?? "";
const refreshTokenSecret = process.env.REFRESH_TOKEN_SECRET?.trim() ?? "";

if (!mongoUri) {
  throw new Error("Missing required environment variable: MONGODB_URI");
}

if (!mongodbDbName) {
  throw new Error("Missing required environment variable: MONGODB_DB_NAME");
}

if (!accessTokenSecret || !refreshTokenSecret) {
  throw new Error("Missing required secrets: ACCESS_TOKEN_SECRET and REFRESH_TOKEN_SECRET");
}

if (accessTokenSecret === refreshTokenSecret) {
  throw new Error("ACCESS_TOKEN_SECRET and REFRESH_TOKEN_SECRET must be different values");
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 5000),
  mongoUri,
  mongodbDbName,
  accessTokenSecret,
  refreshTokenSecret,
  accessTokenExpiry: process.env.ACCESS_TOKEN_EXPIRY ?? "15m",
  refreshTokenExpiry: process.env.REFRESH_TOKEN_EXPIRY ?? "7d",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiChatModel: process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini",
  openaiEmbeddingModel: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
  redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
  processorMode: process.env.PROCESSOR_MODE ?? "all",
  /** Comma-separated list of allowed browser origins for CORS (e.g. http://localhost:3000,https://app.example.com). */
  corsOrigins: (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};
