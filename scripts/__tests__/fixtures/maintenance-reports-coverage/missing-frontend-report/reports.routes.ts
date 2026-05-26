const reportIds = [
  "cost_per_unit",
  "cost_per_mile",
  "cost_by_source_type",
  "pm_compliance_summary",
  "inspection_pass_fail_rate",
  "top_vendors_by_spend",
  "work_orders_over_threshold",
  "work_orders_aged_over_days",
];

app.get("/api/v1/maintenance/reports/:report/export.xlsx", async () => reportIds);
