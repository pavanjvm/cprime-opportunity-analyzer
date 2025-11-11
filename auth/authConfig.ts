import dotenv from 'dotenv';
dotenv.config({ path: '.env.dev' });
import type { Configuration} from '@azure/msal-node';

export const msalConfig: Configuration = {
  auth: {
    clientId: process.env.AZURE_CLIENT_ID as string,
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
    clientSecret: process.env.AZURE_CLIENT_SECRET as string,
  },
  system: {
    loggerOptions: {
      loggerCallback: (loglevel: any, message: string, containsPii: boolean) => {
        console.log(message);
      },
      piiLoggingEnabled: false,
      logLevel: 3,
    }
  }
};

export const REDIRECT_URI = process.env.AZURE_REDIRECT_URI as string;
export const POST_LOGOUT_REDIRECT_URI = process.env.POST_LOGOUT_REDIRECT_URI as string;
export const GRAPH_ME_ENDPOINT = `${process.env.GRAPH_API_ENDPOINT as string}v1.0/me`;
