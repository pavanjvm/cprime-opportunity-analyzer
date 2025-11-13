import type { Request, Response } from "express";
import { exchangeCodeForTokens, refreshAccessToken } from "./azureOAuthservice.js";
import { issueJwtToken } from "./authService.js";
import {prisma} from "../prisma/lib/client.js"
import {
  AZURE_AUTHORITY,
  AZURE_CLIENT_ID,
  AZURE_REDIRECT_URI,
  AZURE_SCOPES,
} from "./config.js";




export class AuthController {
  static azureLogin(req: Request, res: Response) {
    if (!AZURE_CLIENT_ID || !AZURE_REDIRECT_URI) {
  throw new Error("Missing Azure OAuth environment variables");
}
    const params = new URLSearchParams({
    client_id: AZURE_CLIENT_ID, // now definitely a string ✅
    response_type: "code",
    redirect_uri: AZURE_REDIRECT_URI, // also definitely a string ✅
    response_mode: "query",
    scope: AZURE_SCOPES.join(" "),
  });
    const authUrl = `${AZURE_AUTHORITY}/oauth2/v2.0/authorize?${params}`;
    res.redirect(authUrl);
  }

  static async azureCallback(req: Request, res: Response) {
    try {
      const { code } = req.query as { code: string };
      const tokenResponse = await exchangeCodeForTokens(code, AZURE_REDIRECT_URI);

      res.cookie("azureAccount", JSON.stringify(tokenResponse.account), {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 86400 * 1000,
      });

      res.json({
        accessToken: tokenResponse.accessToken,
        idToken: tokenResponse.idToken,
        account: tokenResponse.account,
      });
    } catch (error) {
      console.error(error);
      res.status(400).json({ error: "OAuth callback failed" });
    }
  }

  static async signIn(req: Request, res: Response) {
    try {

      const { accessToken, email } = req.body;
      const user = await prisma.user.upsert({
        where: { email },
        update: { accessToken }, // if user exists, update access token
        create: { email, accessToken }, // if user doesn't exist, create new one
      });
      const userId = user.id // normally from DB
      const jwtToken = await issueJwtToken(accessToken, userId);

      res.cookie("authcontroller_jwt", jwtToken, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 86400 * 1000,
      });

      res.json({ user: { email, userId }, jwtToken });
    } catch (error) {
      res.status(400).json({ error: "Sign-in failed" });
    }
  }

  static async refresh(req: Request, res: Response) {
    try {
      const accountCookie = req.cookies.azureAccount;
      if (!accountCookie)
        return res.status(401).json({ error: "Not logged in" });

      const account = JSON.parse(accountCookie);
      const newTokens = await refreshAccessToken(account);
      res.json(newTokens.accessToken);
    } catch (error) {
      console.log(error)
      res.status(400).json({ error: "couldnt get refresh tokens" });
    }
  }

  static signOut(req: Request, res: Response) {
    res.clearCookie("jwt");
    res.clearCookie("azureAccount");
    res.json({ message: "Signed out" });
  }
}
