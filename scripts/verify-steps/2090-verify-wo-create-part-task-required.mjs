export default {
  name: "verify-wo-create-part-task-required",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-wo-create-part-task-required.mjs"]);
    ctx.run("node", ["scripts/verify-wo-create-part-task-required.mjs", "--selftest"]);
    // BANK-F91509 — CreateWorkOrderModal leftover #94a3b8/#475569 refuse (this EVEN host already owns the live guard).
  },
};
