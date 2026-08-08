export default {
  name: "verify:kanban-dropstatus-contract",
  run(ctx) {
    ctx.run("node", ["scripts/verify-kanban-dropstatus-contract.mjs"]);
  },
};
