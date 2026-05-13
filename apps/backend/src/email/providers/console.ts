import type { EmailProvider, SendEmailInput, SendEmailResult } from "../provider.js";

export function createConsoleEmailProvider(): EmailProvider {
  return {
    kind: "console",
    async send(input: SendEmailInput): Promise<SendEmailResult> {
      const messageId = `console-email-${Date.now()}`;
      console.info("[email:console]", {
        messageId,
        to: input.to,
        cc: input.cc,
        bcc: input.bcc,
        subject: input.subject,
        text_preview: input.text?.slice(0, 240),
        html_preview: input.html.slice(0, 240),
        attachment_count: input.attachments?.length ?? 0,
      });
      return { messageId };
    },
  };
}
