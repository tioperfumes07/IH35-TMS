import type { EmailProvider } from "./provider.js";
import { createConsoleEmailProvider } from "./providers/console.js";
import { createPostmarkEmailProvider } from "./providers/postmark.js";
import { createSesEmailProvider } from "./providers/ses.js";
import { createGoogleEmailProvider } from "./providers/google.js";

export function createEmailProviderFromEnv(): EmailProvider {
  const raw = (process.env.EMAIL_PROVIDER ?? "console").trim().toLowerCase();
  if (!raw || raw === "console") return createConsoleEmailProvider();

  if (raw === "ses") {
    const region = process.env.AWS_SES_REGION?.trim();
    const fromAddress = process.env.EMAIL_FROM_NOREPLY?.trim() || process.env.EMAIL_FROM_DISPATCH?.trim();
    if (!region) throw new Error("AWS_SES_REGION is required when EMAIL_PROVIDER=ses");
    if (!fromAddress) throw new Error("EMAIL_FROM_NOREPLY or EMAIL_FROM_DISPATCH is required when EMAIL_PROVIDER=ses");
    return createSesEmailProvider({ region, fromAddress });
  }

  if (raw === "postmark") {
    const token = process.env.POSTMARK_API_TOKEN?.trim();
    const fromAddress = process.env.EMAIL_FROM_NOREPLY?.trim() || process.env.EMAIL_FROM_DISPATCH?.trim();
    if (!token) throw new Error("POSTMARK_API_TOKEN is required when EMAIL_PROVIDER=postmark");
    if (!fromAddress) throw new Error("EMAIL_FROM_NOREPLY or EMAIL_FROM_DISPATCH is required when EMAIL_PROVIDER=postmark");
    return createPostmarkEmailProvider({ serverToken: token, fromAddress });
  }

  if (raw === "google" || raw === "gmail") {
    // REUSE the Google OAuth client that already exists for sign-in (auth/lucia.ts reads the same
    // OAUTH_GOOGLE_* pair, and both are already set in Render). Gmail send and Google sign-in are the
    // same OAuth client in the same Cloud project — only the granted scope differs — so duplicating
    // the credentials under a second name would be two places to rotate and two places to get wrong.
    // GOOGLE_EMAIL_CLIENT_ID/SECRET remain supported as an override for a dedicated sending client.
    const clientId =
      process.env.GOOGLE_EMAIL_CLIENT_ID?.trim() || process.env.OAUTH_GOOGLE_CLIENT_ID?.trim();
    const clientSecret =
      process.env.GOOGLE_EMAIL_CLIENT_SECRET?.trim() || process.env.OAUTH_GOOGLE_CLIENT_SECRET?.trim();
    const refreshToken = process.env.GOOGLE_EMAIL_REFRESH_TOKEN?.trim();
    const fromAddress = process.env.EMAIL_FROM_NOREPLY?.trim() || process.env.EMAIL_FROM_DISPATCH?.trim();
    if (!clientId) {
      throw new Error(
        "GOOGLE_EMAIL_CLIENT_ID or OAUTH_GOOGLE_CLIENT_ID is required when EMAIL_PROVIDER=google"
      );
    }
    if (!clientSecret) {
      throw new Error(
        "GOOGLE_EMAIL_CLIENT_SECRET or OAUTH_GOOGLE_CLIENT_SECRET is required when EMAIL_PROVIDER=google"
      );
    }
    if (!refreshToken) throw new Error("GOOGLE_EMAIL_REFRESH_TOKEN is required when EMAIL_PROVIDER=google");
    if (!fromAddress) throw new Error("EMAIL_FROM_NOREPLY or EMAIL_FROM_DISPATCH is required when EMAIL_PROVIDER=google");

    // Optional second mailbox (USMCA sends from its own Gmail account, not an alias of the Workspace
    // one). JSON: {"usmcafreightsolutions@gmail.com":"<refresh-token>"} — addresses are lower-cased so
    // a From with different casing still resolves.
    let refreshTokenByAddress: Record<string, string> | undefined;
    const rawMap = process.env.GOOGLE_EMAIL_REFRESH_TOKEN_BY_ADDRESS?.trim();
    if (rawMap) {
      try {
        const parsed = JSON.parse(rawMap) as Record<string, string>;
        refreshTokenByAddress = Object.fromEntries(
          Object.entries(parsed).map(([addr, tok]) => [addr.trim().toLowerCase(), String(tok)])
        );
      } catch {
        // Fail loudly: a malformed map would silently send every entity from the default mailbox.
        throw new Error("GOOGLE_EMAIL_REFRESH_TOKEN_BY_ADDRESS is not valid JSON");
      }
    }

    return createGoogleEmailProvider({
      clientId,
      clientSecret,
      refreshToken,
      fromAddress,
      refreshTokenByAddress,
    });
  }

  throw new Error(`unsupported_EMAIL_PROVIDER:${raw}`);
}
