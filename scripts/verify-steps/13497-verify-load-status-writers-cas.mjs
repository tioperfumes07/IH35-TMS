export default {
  name: "verify:load-status-writers-cas",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-status-writers-cas.mjs"]);
  },
};
