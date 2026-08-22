export default {
  name: "verify:customers-list-inactive-status-same-company",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customers-list-inactive-status-same-company.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-customers-list-inactive-status-same-company.mjs"]);
  },
};
