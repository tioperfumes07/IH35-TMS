export {
  abandonedLoadTemplateBody,
  abandonedLoadTemplateName,
  abandonedLoadTemplateVariables,
  type AbandonedLoadTemplateVars,
} from "./abandoned-load.js";
export {
  dispatchSheetTemplateBody,
  dispatchSheetTemplateName,
  dispatchSheetTemplateVariables,
  type DispatchSheetTemplateVars,
} from "./dispatch-sheet.js";
export {
  loadAssignmentTemplateBody,
  loadAssignmentTemplateName,
  loadAssignmentTemplateVariables,
  type LoadAssignmentTemplateVars,
} from "./load-assignment.js";
export {
  paymentReceivedTemplateBody,
  paymentReceivedTemplateName,
  paymentReceivedTemplateVariables,
  type PaymentReceivedTemplateVars,
} from "./payment-received.js";
export {
  settlementReadyTemplateBody,
  settlementReadyTemplateName,
  settlementReadyTemplateVariables,
  type SettlementReadyTemplateVars,
} from "./settlement-ready.js";

/** Canonical registry for docs/codegen — Meta submission copies body + maps variables to {{n}}. */
export const whatsappTemplateRegistry = [
  {
    file: "load-assignment.ts",
    name: "ih35_load_assignment_v1",
    variables: ["driver_name", "origin", "dest", "rate", "link"],
  },
  {
    file: "settlement-ready.ts",
    name: "ih35_settlement_ready_v1",
    variables: ["settlement_no", "net", "link"],
  },
  {
    file: "payment-received.ts",
    name: "ih35_payment_received_v1",
    variables: ["amount", "customer", "date", "bank_account"],
  },
  {
    file: "dispatch-sheet.ts",
    name: "ih35_dispatch_sheet_v1",
    variables: ["load_no", "driver", "link"],
  },
  {
    file: "abandoned-load.ts",
    name: "ih35_abandoned_load_v1",
    variables: ["load_no", "driver_name"],
  },
] as const;
