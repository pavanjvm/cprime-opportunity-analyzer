import { ConfidentialClientApplication } from "@azure/msal-node";
import dotenv from 'dotenv';
dotenv.config();
const {
  AZURE_CLIENT_ID,
  AZURE_CLIENT_SECRET,
  AZURE_TENANT_ID,
} = process.env;
const AZURE_AUTHORITY = `https://login.microsoftonline.com/${AZURE_TENANT_ID}`;
const AZURE_SCOPES = ["openid", "profile", "email", "offline_access"];

const cca = new ConfidentialClientApplication({
  auth: {
    clientId: AZURE_CLIENT_ID!,
    clientSecret: AZURE_CLIENT_SECRET!,
    authority: AZURE_AUTHORITY,
  },
});
export async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const tokenResponse = await cca.acquireTokenByCode({
    code,
    redirectUri,
    scopes: AZURE_SCOPES,
  });

  if (!tokenResponse) throw new Error("Failed to acquire tokens from Azure");

  return {
    accessToken: tokenResponse.accessToken,
    idToken: tokenResponse.idToken,
    account: tokenResponse.account,
  };
}

export async function refreshAccessToken(account: any) {
  const tokenResponse = await cca.acquireTokenSilent({
    account,
    scopes: AZURE_SCOPES,
  });
  return tokenResponse;
}
