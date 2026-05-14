/**
 * WhatsApp Business — dispatch sheet published (pre-approved draft).
 *
 * @preview
 * Dispatch sheet for load LD-908812 ready. Driver: Maria Lopez. View: https://dispatch.example.com/dispatch/sheets/908812
 */
export const dispatchSheetTemplateName = "ih35_dispatch_sheet_v1";

export const dispatchSheetTemplateBody = "Dispatch sheet for load {load_no} ready. Driver: {driver}. View: {link}";

export const dispatchSheetTemplateVariables = ["load_no", "driver", "link"] as const;

export type DispatchSheetTemplateVars = {
  load_no: string;
  driver: string;
  link: string;
};
