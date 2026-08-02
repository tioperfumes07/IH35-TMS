// SAF-F20 — incidents cluster EntityLink drill-through (verify-step 2060).
export default {
  name: "safety-incidents-entitylink",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-safety-incidents-entitylink.mjs"]);
  },
};
