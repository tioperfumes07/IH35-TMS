export type RunbookLink = {
  slug: string;
  title: string;
  frequency: string;
  description: string;
  /** Repository-relative path to the runbook markdown. */
  docPath: string;
};

export const RUNBOOKS: RunbookLink[] = [
  {
    slug: "close-of-month",
    title: "Close of Month",
    frequency: "Monthly",
    description: "Bills, reconciliations, aging, financial statements, period lock + distribution.",
    docPath: "docs/runbooks/CLOSE-OF-MONTH.md",
  },
  {
    slug: "ifta-quarterly-filing",
    title: "IFTA Quarterly Filing",
    frequency: "Quarterly",
    description: "IFTA-by-state report, miles/fuel validation, filing, payment, QBO JE.",
    docPath: "docs/runbooks/IFTA-QUARTERLY-FILING.md",
  },
  {
    slug: "w2-payroll-cycle",
    title: "W-2 Payroll Cycle",
    frequency: "Bi-weekly / Monthly",
    description: "QBO Payroll for office staff, withholdings, paystubs, tax payments.",
    docPath: "docs/runbooks/W2-PAYROLL-CYCLE.md",
  },
  {
    slug: "1099-contractor-payroll",
    title: "1099 Contractor Payroll",
    frequency: "Per cycle + year-end",
    description: "Driver settlements, $600 threshold tracking, year-end 1099-NEC.",
    docPath: "docs/runbooks/1099-CONTRACTOR-PAYROLL.md",
  },
  {
    slug: "collections-workflow",
    title: "Collections Workflow",
    frequency: "Daily / weekly",
    description: "AR aging buckets, 30/60/90-day escalation ladder, write-offs.",
    docPath: "docs/runbooks/COLLECTIONS-WORKFLOW.md",
  },
  {
    slug: "bank-reconciliation",
    title: "Bank Reconciliation",
    frequency: "Daily + monthly",
    description: "Plaid sync, categorization, matching, period reconcile + lock.",
    docPath: "docs/runbooks/BANK-RECONCILIATION.md",
  },
  {
    slug: "fuel-card-import",
    title: "Fuel Card Import",
    frequency: "Weekly",
    description: "Love's / WEX imports, jurisdiction validation, QBO bill, allocation.",
    docPath: "docs/runbooks/FUEL-CARD-IMPORT.md",
  },
  {
    slug: "driver-onboarding-checklist",
    title: "Driver Onboarding Checklist",
    frequency: "Per driver",
    description: "Pre-hire screens, DQF, system setup, training, first load.",
    docPath: "docs/runbooks/DRIVER-ONBOARDING-CHECKLIST.md",
  },
  {
    slug: "unit-acquisition-workflow",
    title: "Unit Acquisition Workflow",
    frequency: "Per unit",
    description: "Purchase, title/DOT, insurance, Samsara, PM schedule, assignment.",
    docPath: "docs/runbooks/UNIT-ACQUISITION-WORKFLOW.md",
  },
  {
    slug: "operational-tuning-catalog",
    title: "Operational Tuning Catalog",
    frequency: "Reference",
    description: "All tunable cron, rate limit, timeout, cache, batch, and alert parameters.",
    docPath: "docs/runbooks/operational-tuning-catalog.md",
  },
];
