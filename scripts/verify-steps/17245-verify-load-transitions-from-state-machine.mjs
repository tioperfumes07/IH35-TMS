export default {
  name: "verify:load-transitions-from-state-machine",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-transitions-from-state-machine.mjs"]);
  },
};
