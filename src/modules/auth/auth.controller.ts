import type { NextFunction, Request, Response } from "express";

import { apiResponse } from "../../utils/api-response";
import { authService } from "./auth.service";

const register = (req: Request, res: Response, next: NextFunction): void => {
  authService
    .register(req.body)
    .then((result) => {
      res.status(201).json(apiResponse.success("User registered successfully", result));
    })
    .catch(next);
};

const login = (req: Request, res: Response, next: NextFunction): void => {
  authService
    .login(req.body)
    .then((result) => {
      res.status(200).json(apiResponse.success("Login successful", result));
    })
    .catch(next);
};

const refresh = (req: Request, res: Response, next: NextFunction): void => {
  const refreshToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : "";
  authService
    .refreshAccessToken(refreshToken)
    .then((result) => {
      res.status(200).json(apiResponse.success("Access token refreshed", result));
    })
    .catch(next);
};

const me = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user?.userId) {
    res.status(401).json(apiResponse.error("Unauthorized"));
    return;
  }

  authService
    .getCurrentUser(req.user.userId)
    .then((user) => {
      res.status(200).json(apiResponse.success("User fetched successfully", { user }));
    })
    .catch(next);
};

const updateProfile = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user?.userId) {
    res.status(401).json(apiResponse.error("Unauthorized"));
    return;
  }

  authService
    .updateProfile(req.user.userId, req.body)
    .then((user) => {
      res.status(200).json(apiResponse.success("Profile updated successfully", { user }));
    })
    .catch(next);
};

const deleteAccount = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user?.userId) {
    res.status(401).json(apiResponse.error("Unauthorized"));
    return;
  }

  authService
    .deleteAccount(req.user.userId, req.body)
    .then((result) => {
      res.status(200).json(apiResponse.success("Account deleted successfully", result));
    })
    .catch(next);
};

const requestEmailVerification = (req: Request, res: Response, next: NextFunction): void => {
  authService
    .requestEmailVerification(req.body)
    .then((result) => {
      res.status(200).json(apiResponse.success("Verification email requested", result));
    })
    .catch(next);
};

const confirmEmailVerification = (req: Request, res: Response, next: NextFunction): void => {
  authService
    .confirmEmailVerification(req.body)
    .then((result) => {
      res.status(200).json(apiResponse.success("Email verified successfully", result));
    })
    .catch(next);
};

const forgotPassword = (req: Request, res: Response, next: NextFunction): void => {
  authService
    .requestPasswordReset(req.body)
    .then((result) => {
      res.status(200).json(apiResponse.success("Password reset requested", result));
    })
    .catch(next);
};

const resetPassword = (req: Request, res: Response, next: NextFunction): void => {
  authService
    .resetPassword(req.body)
    .then((result) => {
      res.status(200).json(apiResponse.success("Password reset successful", result));
    })
    .catch(next);
};

export {
  confirmEmailVerification,
  deleteAccount,
  forgotPassword,
  login,
  me,
  refresh,
  register,
  requestEmailVerification,
  resetPassword,
  updateProfile,
};
