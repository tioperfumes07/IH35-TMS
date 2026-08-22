export default {
  name: "verify:vendors-list-inactive-status-same-company",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vendors-list-inactive-status-same-company.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-vendors-list-inactive-status-same-company.mjs"]);
  },
};
