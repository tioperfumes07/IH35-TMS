export type EmailAttachment = {
  filename: string;
  contentBase64: string;
  contentType?: string;
};

export type SendEmailInput = {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
};

export type SendEmailResult = {
  messageId: string;
};

export interface EmailProvider {
  readonly kind: "console" | "ses" | "postmark";
  send(input: SendEmailInput): Promise<SendEmailResult>;
}
