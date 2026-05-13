import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import type { EmailProvider, SendEmailInput, SendEmailResult } from "../provider.js";

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function createSesEmailProvider(args: { region: string; fromAddress: string }): EmailProvider {
  const client = new SESClient({ region: args.region });
  return {
    kind: "ses",
    async send(input: SendEmailInput): Promise<SendEmailResult> {
      if (input.attachments?.length) {
        throw new Error("ses_provider_attachments_not_supported_use_postmark");
      }
      const bodyText = input.text?.trim() ? input.text : stripHtml(input.html);
      const cmd = new SendEmailCommand({
        Source: args.fromAddress,
        Destination: {
          ToAddresses: input.to,
          CcAddresses: input.cc?.length ? input.cc : undefined,
          BccAddresses: input.bcc?.length ? input.bcc : undefined,
        },
        Message: {
          Subject: { Data: input.subject, Charset: "UTF-8" },
          Body: {
            Html: { Data: input.html, Charset: "UTF-8" },
            ...(bodyText ? { Text: { Data: bodyText, Charset: "UTF-8" } } : {}),
          },
        },
      });
      const out = await client.send(cmd);
      const messageId = String(out.MessageId ?? `ses-${Date.now()}`);
      return { messageId };
    },
  };
}
