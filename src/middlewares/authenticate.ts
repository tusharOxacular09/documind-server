import type { NextFunction, Request, Response } from "express";

import { apiResponse } from "../utils/api-response";
import { jwtUtils } from "../modules/auth/jwt.utils";

export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json(apiResponse.error("Unauthorized"));
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwtUtils.verifyAccessToken(token);
    req.user = { userId: decoded.userId };
    next();
  } catch (_error) {
    res.status(401).json(apiResponse.error("Invalid token"));
  }
};
