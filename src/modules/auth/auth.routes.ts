import { Router } from "express";

import { authenticate } from "../../middlewares/authenticate";
import {
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
} from "./auth.controller";

const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.post("/refresh", refresh);
authRouter.post("/verification/request", requestEmailVerification);
authRouter.post("/verification/confirm", confirmEmailVerification);
authRouter.post("/password/forgot", forgotPassword);
authRouter.post("/password/reset", resetPassword);
authRouter.post("/account/delete", authenticate, deleteAccount);
authRouter.get("/me", authenticate, me);
authRouter.put("/profile", authenticate, updateProfile);

export { authRouter };
