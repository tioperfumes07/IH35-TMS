import type { EmailProvider } from "./provider.js";
import { createConsoleEmailProvider } from "./providers/console.js";
import { createPostmarkEmailProvider } from "./providers/postmark.js";
import { createSesEmailProvider } from "./providers/ses.js";

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

  throw new Error(`unsupported_EMAIL_PROVIDER:${raw}`);
}
