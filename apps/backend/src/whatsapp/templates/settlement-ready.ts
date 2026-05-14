/**
 * WhatsApp Business — settlement ready notification (pre-approved draft).
 *
 * @preview
 * Settlement STL-2026-0042 ready. Net pay $3,482.15. View: https://dispatch.example.com/driver/settlements/stl-42
 *
 * Meta mapping tip: numbered placeholders {{1}} settlement_no, {{2}} net, {{3}} link (LIMITED purpose templates may vary).
 */
export const settlementReadyTemplateName = "ih35_settlement_ready_v1";

export const settlementReadyTemplateBody = "Settlement {settlement_no} ready. Net pay ${net}. View: {link}";

export const settlementReadyTemplateVariables = ["settlement_no", "net", "link"] as const;

export type SettlementReadyTemplateVars = {
  settlement_no: string;
  net: string;
  link: string;
};
