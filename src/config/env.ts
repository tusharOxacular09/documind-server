import dotenv from "dotenv";

dotenv.config();

const mongoUri = process.env.MONGO_URI ?? process.env.MONGODB_URI ?? "";
const accessTokenSecret =
  process.env.ACCESS_TOKEN_SECRET ?? process.env.JWT_SECRET ?? "";
const refreshTokenSecret =
  process.env.REFRESH_TOKEN_SECRET ?? process.env.JWT_SECRET ?? accessTokenSecret;

if (!mongoUri) {
  throw new Error("Missing required environment variable: MONGO_URI (or MONGODB_URI)");
}

if (!accessTokenSecret || !refreshTokenSecret) {
  throw new Error(
    "Missing JWT secrets: set JWT_SECRET or both ACCESS_TOKEN_SECRET and REFRESH_TOKEN_SECRET"
  );
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 5000),
  mongoUri,
  mongodbDbName: process.env.MONGODB_DB_NAME ?? "documind",
  accessTokenSecret,
  refreshTokenSecret,
  accessTokenExpiry: process.env.ACCESS_TOKEN_EXPIRY ?? "15m",
  refreshTokenExpiry: process.env.REFRESH_TOKEN_EXPIRY ?? "7d",
};
