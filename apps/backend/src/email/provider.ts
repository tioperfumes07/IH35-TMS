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
  /** Reply-To address (e.g. the dispatch mailbox for truck offers). */
  replyTo?: string;
  /**
   * Extra RFC 5322 headers (e.g. List-Unsubscribe / List-Unsubscribe-Post on offer emails). A provider that cannot carry
   * them THROWS — a header that silently disappears (an unsubscribe the recipient never sees) is worse than a failed send.
   */
  headers?: Record<string, string>;
};

export type SendEmailResult = {
  messageId: string;
};

export interface EmailProvider {
  readonly kind: "console" | "ses" | "postmark" | "google";
  send(input: SendEmailInput): Promise<SendEmailResult>;
}
