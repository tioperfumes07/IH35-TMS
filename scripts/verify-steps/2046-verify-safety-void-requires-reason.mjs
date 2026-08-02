// SAF-F11 — DOT Inspections + Complaints void requires operator reason (Cursor EVEN band).
export default {
  name: "safety-void-requires-reason",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-void-requires-reason.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-safety-void-requires-reason.mjs"]);
  },
};
