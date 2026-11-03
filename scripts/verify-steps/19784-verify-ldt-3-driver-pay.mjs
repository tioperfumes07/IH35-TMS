export default {
  name: "verify:ldt-3-driver-pay",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ldt-3-driver-pay.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-ldt-3-driver-pay.mjs"]);
  },
};
