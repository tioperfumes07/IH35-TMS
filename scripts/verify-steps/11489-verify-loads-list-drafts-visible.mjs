export default {
  name: "verify:loads-list-drafts-visible",
  run(ctx) {
    ctx.run("node", ["scripts/verify-loads-list-drafts-visible.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-loads-list-drafts-visible.mjs"]);
  },
};
