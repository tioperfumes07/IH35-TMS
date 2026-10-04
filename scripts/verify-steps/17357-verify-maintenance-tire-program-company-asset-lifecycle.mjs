export default {
  name: "verify:maintenance-tire-program-company-asset-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maintenance-tire-program-company-asset-lifecycle.mjs"]);
  },
};
