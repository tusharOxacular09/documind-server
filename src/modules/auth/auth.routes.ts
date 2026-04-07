import { Router } from "express";

import { authenticate } from "../../middlewares/authenticate";
import { deleteAccount, login, me, refresh, register, updateProfile } from "./auth.controller";

const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.post("/refresh", refresh);
authRouter.post("/account/delete", authenticate, deleteAccount);
authRouter.get("/me", authenticate, me);
authRouter.put("/profile", authenticate, updateProfile);

export { authRouter };
