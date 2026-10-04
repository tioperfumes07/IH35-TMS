export default {
  name: "verify:scroll-containers-are-reachable",
  run(ctx) {
    // LST-F400 (owner 2026-10-04): "THE PAGES ARE NOT SCROLLING CORRECTLY, I CAN SEE UP TO FINANCE HUB
    // BUT I CANNOT SCROLL DOWN TO GO TO OTHER MODULES" + "IN ACCOUNTING MORE I SEE THE LIST, BUT I
    // CANNOT SCROLL DOWN TO A SUB TAB". Two classes: a flex scroller with no min-h-0, and a
    // position:fixed menu with no maxHeight. Both shrink-only at zero.
    ctx.run("node", ["scripts/verify-scroll-containers-are-reachable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-scroll-containers-are-reachable.mjs"]);
  },
};
