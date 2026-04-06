import jwt, { type SignOptions } from "jsonwebtoken";

import { env } from "../../config/env";

type AccessPayload = {
  userId: string;
};

type RefreshPayload = {
  userId: string;
  tokenType: "refresh";
};

export const jwtUtils = {
  signAccessToken: (payload: AccessPayload): string =>
    jwt.sign(payload, env.accessTokenSecret, {
      expiresIn: env.accessTokenExpiry as SignOptions["expiresIn"],
    }),
  signRefreshToken: (userId: string): string =>
    jwt.sign({ userId, tokenType: "refresh" }, env.refreshTokenSecret, {
      expiresIn: env.refreshTokenExpiry as SignOptions["expiresIn"],
    }),
  verifyAccessToken: (token: string): AccessPayload => {
    const decoded = jwt.verify(token, env.accessTokenSecret);
    if (typeof decoded !== "object" || decoded === null || typeof decoded.userId !== "string") {
      throw new Error("Invalid access token");
    }
    return { userId: decoded.userId };
  },
  verifyRefreshToken: (token: string): RefreshPayload => {
    const decoded = jwt.verify(token, env.refreshTokenSecret);
    if (
      typeof decoded !== "object" ||
      decoded === null ||
      typeof decoded.userId !== "string" ||
      decoded.tokenType !== "refresh"
    ) {
      throw new Error("Invalid refresh token");
    }
    return { userId: decoded.userId, tokenType: "refresh" };
  },
};
