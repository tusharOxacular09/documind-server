import { Router } from "express";

import { authenticate } from "../../middlewares/authenticate";
import { login, me, refresh, register, updateProfile } from "./auth.controller";

const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.post("/refresh", refresh);
authRouter.get("/me", authenticate, me);
authRouter.put("/profile", authenticate, updateProfile);

export { authRouter };
