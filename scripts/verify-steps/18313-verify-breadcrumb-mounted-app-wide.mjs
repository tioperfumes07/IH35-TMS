// R433 (U18): breadcrumb mounted app-wide from Shell (route-parent data); a page's own trail claims the slot,
// so no page shows two. Step 18313 · CC-1 lane.
export default {
  name: "breadcrumb-mounted-app-wide",
  run(ctx) {
    const guards = [
      "scripts/verify-breadcrumb-mounted-app-wide.mjs",
      "scripts/verify-page-multiselect-coverage-count.mjs",
      "scripts/verify-page-breadcrumb-coverage-count.mjs",
      "scripts/verify-page-sortable-header-coverage-count.mjs",
      "scripts/verify-page-row-click-coverage-count.mjs",
      "scripts/verify-page-natural-sign-coverage-count.mjs",
      "scripts/verify-r433-mechanical-u-items.mjs",
    ];
    for (const guard of guards) ctx.run("node", [guard, "--selftest"]);
    for (const guard of guards.slice(0, -1)) ctx.run("node", [guard]);
    return ctx.run("node", [guards.at(-1)]);
  },
};
