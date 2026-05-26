const dueSoonConfig = {
  days: Number(process.env.MAINT_PM_DUE_SOON_DAYS ?? "14"),
  miles: Number(process.env.MAINT_PM_DUE_SOON_MILES ?? "500"),
  hours: Number(process.env.MAINT_PM_DUE_SOON_HOURS ?? "20"),
};

function classifyPmStatus() {
  return dueSoonConfig.miles > 0 ? "current" : "overdue";
}
