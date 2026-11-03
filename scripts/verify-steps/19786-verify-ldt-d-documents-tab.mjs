export default {
  name: "verify:ldt-d-documents-tab",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ldt-d-documents-tab.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-ldt-d-documents-tab.mjs"]);
  },
};
