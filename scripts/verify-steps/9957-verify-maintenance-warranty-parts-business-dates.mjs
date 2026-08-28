export default {
  name: "verify:maintenance-warranty-parts-business-dates",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maintenance-warranty-parts-business-dates.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-maintenance-warranty-parts-business-dates.mjs"]);
  },
};
