export type EmailAttachment = {
  filename: string;
  contentBase64: string;
  contentType?: string;
};

export type SendEmailInput = {
  /**
   * Sender address. Optional — providers fall back to their configured default. Present because the
   * carrier is multi-entity: TRANSP/TRK bill from the ih35trucking.net mailbox and USMCA from its own,
   * so the From cannot be a single process-wide constant.
   */
  from?: string;
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
  readonly kind: "console" | "ses" | "postmark" | "google";
  send(input: SendEmailInput): Promise<SendEmailResult>;
}
