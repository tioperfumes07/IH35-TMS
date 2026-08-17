export default {
  name: "verify:accounting-hub-open-invoices-excludes-void",
  run(ctx) {
    ctx.run("node", ["scripts/verify-accounting-hub-open-invoices-excludes-void.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-accounting-hub-open-invoices-excludes-void.mjs"]);
  },
};
