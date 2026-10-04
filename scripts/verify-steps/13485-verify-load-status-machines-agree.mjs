export default {
  name: "verify:load-status-machines-agree",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-status-machines-agree.mjs"]);
  },
};
