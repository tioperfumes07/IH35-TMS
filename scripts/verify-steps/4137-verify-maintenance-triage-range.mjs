export default {
  name: "verify:maintenance-triage-range",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maintenance-triage-range.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-maintenance-triage-range.mjs"]);
  },
};
