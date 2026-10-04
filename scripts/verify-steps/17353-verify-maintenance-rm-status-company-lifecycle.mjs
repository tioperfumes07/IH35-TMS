export default {
  name: "verify:maintenance-rm-status-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maintenance-rm-status-company-lifecycle.mjs"]);
  },
};
