import type { NextFunction, Request, Response } from "express";
import multer from "multer";

import { env } from "../../config/env";
import { apiResponse } from "../../utils/api-response";

const MAX_UPLOAD_BYTES = env.uploadMaxBytes;

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

const singleFileUpload = memoryUpload.single("file");

const handleMultipartFile = (req: Request, res: Response, next: NextFunction): void => {
  singleFileUpload(req, res, (err: unknown) => {
    if (err) {
      const multerErr = err as { code?: string };
      if (multerErr?.code === "LIMIT_FILE_SIZE") {
        res.status(413).json(apiResponse.error(`File exceeds ${env.uploadMaxMb}MB upload limit`));
        return;
      }
      if (multerErr?.code === "LIMIT_UNEXPECTED_FILE") {
        res.status(400).json(apiResponse.error("Unexpected file field (use field name 'file')"));
        return;
      }
      next(err);
      return;
    }
    next();
  });
};

export { handleMultipartFile, MAX_UPLOAD_BYTES };
