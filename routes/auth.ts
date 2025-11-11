import type { Request, Response } from 'express';
import { Router } from 'express';
const authRouter = Router();

import { AuthController } from "../auth/AuthController.js";

authRouter.get("/azure/login", AuthController.azureLogin);
authRouter.get("/azure/callback", AuthController.azureCallback);
authRouter.post("/sign-in", AuthController.signIn);
authRouter.post("/sign-out", AuthController.signOut);
authRouter.post("/azure/refresh", AuthController.refresh);

export default authRouter;