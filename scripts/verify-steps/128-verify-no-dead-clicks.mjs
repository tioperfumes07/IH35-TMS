// UI-STANDARD guard (master-sequence item 4, 2026-07-14) wired into verify:pre-commit. Fails when a
// NEW dead-click KpiCard/HomeKpiCard (no to=/onClick=) is added above the frozen baseline.
export default {
  name: "no-dead-clicks",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:no-dead-clicks"]) !== 0) {
      process.exit(1);
    }
  },
};
