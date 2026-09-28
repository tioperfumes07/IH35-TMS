export default {
  name: "verify:load-boards-agree",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-boards-agree.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-load-boards-agree.mjs"]);
  },
};
