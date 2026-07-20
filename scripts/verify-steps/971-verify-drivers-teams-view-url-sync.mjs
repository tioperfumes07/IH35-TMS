export default {
  name: "verify-drivers-teams-view-url-sync",
  run(ctx) {
    ctx.run("node", ["scripts/verify-drivers-teams-view-url-sync.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-drivers-teams-view-url-sync.mjs"]);
  },
};
