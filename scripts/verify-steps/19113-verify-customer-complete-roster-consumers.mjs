export default {
  name: "verify:customer-complete-roster-consumers",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customer-complete-roster-consumers.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-customer-complete-roster-consumers.mjs"]);
  },
};
