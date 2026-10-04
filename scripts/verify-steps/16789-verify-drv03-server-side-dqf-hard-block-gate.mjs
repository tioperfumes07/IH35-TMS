export default {
  name: "verify:drv03-server-side-dqf-hard-block-gate",
  run(ctx) {
    ctx.run("node", ["scripts/verify-drv03-server-side-dqf-hard-block-gate.mjs"]);
  },
};
