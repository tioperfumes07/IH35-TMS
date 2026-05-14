/**
 * WhatsApp Business — abandoned load escalation (pre-approved draft).
 *
 * @preview
 * URGENT: load LD-771221 abandoned by Jane Doe. Reassignment in progress.
 *
 * Meta note: urgent templates often require careful category selection; keep variables minimal.
 */
export const abandonedLoadTemplateName = "ih35_abandoned_load_v1";

export const abandonedLoadTemplateBody =
  "URGENT: load {load_no} abandoned by {driver_name}. Reassignment in progress.";

export const abandonedLoadTemplateVariables = ["load_no", "driver_name"] as const;

export type AbandonedLoadTemplateVars = {
  load_no: string;
  driver_name: string;
};
