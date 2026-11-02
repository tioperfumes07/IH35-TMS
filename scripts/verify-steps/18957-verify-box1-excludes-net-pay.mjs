export default {
  name: "verify:box1-excludes-net-pay",
  run(ctx) {
    ctx.run("node", ["scripts/verify-box1-excludes-net-pay.mjs"]);
  },
};
