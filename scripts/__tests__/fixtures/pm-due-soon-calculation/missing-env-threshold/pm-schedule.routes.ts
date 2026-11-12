const dueSoonConfig = {
  days: Number(process.env.MAINT_PM_DUE_SOON_DAYS ?? "14"),
  miles: 500,
  hours: Number(process.env.MAINT_PM_DUE_SOON_HOURS ?? "20"),
};

const due = evaluatePmDue(schedule, currentOdometer, today);
const result = classifyPmScheduleStatus(row, reading?.odometer ?? null, today);
