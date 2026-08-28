export default {
  name: "verify:break-even-route-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-break-even-route-wired.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-break-even-route-wired.mjs"]);
  },
};
