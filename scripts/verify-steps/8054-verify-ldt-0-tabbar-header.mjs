export default {
  name: "verify:ldt-0-tabbar-header",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ldt-0-tabbar-header.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-ldt-0-tabbar-header.mjs"]);
    ctx.run("node", ["scripts/verify-reg023-load-detail-scoped-edit.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-reg023-load-detail-scoped-edit.mjs"]);
    ctx.run("node", ["scripts/verify-reg037-roundtrips-timeline-window.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-reg037-roundtrips-timeline-window.mjs"]);
    ctx.run("node", ["scripts/verify-reg039-load-costs-truck-column.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-reg039-load-costs-truck-column.mjs"]);
  },
};
