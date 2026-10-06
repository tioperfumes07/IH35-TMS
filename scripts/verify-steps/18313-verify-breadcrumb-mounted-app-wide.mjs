// R433 (U18): breadcrumb mounted app-wide from Shell (route-parent data); a page's own trail claims the slot,
// so no page shows two. Step 18313 · CC-1 lane.
export default {
  name: "breadcrumb-mounted-app-wide",
  run(ctx) {
    ctx.run("node", ["scripts/verify-breadcrumb-mounted-app-wide.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-breadcrumb-mounted-app-wide.mjs"]);
  },
};
