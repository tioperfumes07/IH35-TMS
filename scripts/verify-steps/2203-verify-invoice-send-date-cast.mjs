export default {
  name: "verify:invoice-send-date-cast",
  run(ctx) {
    ctx.run("node", ["scripts/verify-invoice-send-date-cast.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-invoice-send-date-cast.mjs"]);
  },
};
