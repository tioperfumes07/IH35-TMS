export default {
  name: "verify:banking-factoring-virtual-fe-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-factoring-virtual-fe-wired.mjs"]);
  },
};
