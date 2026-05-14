/**
 * WhatsApp Business — load assignment notification (pre-approved draft).
 *
 * @preview
 * Jane Doe, you have a new load. Pickup Austin, TX → delivery Dallas, TX. Rate $1,250.00. Tap to accept: https://dispatch.example.com/loads/abc123
 *
 * Meta mapping tip: replace `{variable}` placeholders with {{1}}, {{2}}, … in the Business Manager UI.
 */
export const loadAssignmentTemplateName = "ih35_load_assignment_v1";

export const loadAssignmentTemplateBody =
  "{driver_name}, you have a new load. Pickup {origin} → delivery {dest}. Rate ${rate}. Tap to accept: {link}";

export const loadAssignmentTemplateVariables = ["driver_name", "origin", "dest", "rate", "link"] as const;

export type LoadAssignmentTemplateVars = {
  driver_name: string;
  origin: string;
  dest: string;
  rate: string;
  link: string;
};
