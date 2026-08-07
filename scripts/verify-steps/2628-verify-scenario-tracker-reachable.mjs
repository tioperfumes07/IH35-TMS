// verify-scenario-tracker-reachable — PROG-NAV-01: a routed surface with no inbound link is hidden,
// not shipped. The live 24-slice board at /home/scenario-tracker was routed with ZERO inbound links
// (the rail renders only SIDEBAR_ITEM_META; getSidebarFlyoutItems is dead code), so the owner could
// reach it only by typing the URL. The selftest runs first so a stale guard fails loudly.
export default {
  name: "verify:scenario-tracker-reachable",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-scenario-tracker-reachable.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-scenario-tracker-reachable.mjs"]);
  },
};
