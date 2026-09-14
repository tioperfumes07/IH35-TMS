export default {
  name: "verify:load-shortest-miles-before-pay",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-shortest-miles-before-pay.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-load-shortest-miles-before-pay.mjs"]);
  },
};
