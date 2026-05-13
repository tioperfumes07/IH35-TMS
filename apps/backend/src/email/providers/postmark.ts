import type { EmailProvider, SendEmailInput, SendEmailResult } from "../provider.js";

export function createPostmarkEmailProvider(args: { serverToken: string; fromAddress: string }): EmailProvider {
  return {
    kind: "postmark",
    async send(input: SendEmailInput): Promise<SendEmailResult> {
      const res = await fetch("https://api.postmarkapp.com/email", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Postmark-Server-Token": args.serverToken,
        },
        body: JSON.stringify({
          From: args.fromAddress,
          To: input.to.join(","),
          Cc: input.cc?.length ? input.cc.join(",") : undefined,
          Bcc: input.bcc?.length ? input.bcc.join(",") : undefined,
          Subject: input.subject,
          HtmlBody: input.html,
          TextBody: input.text,
          Attachments: input.attachments?.map((a) => ({
            Name: a.filename,
            Content: a.contentBase64,
            ContentType: a.contentType ?? "application/octet-stream",
          })),
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`postmark_send_failed:${res.status}:${body.slice(0, 500)}`);
      }
      const payload = (await res.json()) as { MessageID?: string };
      const messageId = String(payload.MessageID ?? `postmark-${Date.now()}`);
      return { messageId };
    },
  };
}
