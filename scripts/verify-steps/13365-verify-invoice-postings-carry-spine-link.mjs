export default {
  name: "verify:invoice-postings-carry-spine-link",
  run(ctx) {
    ctx.run("node", ["scripts/verify-invoice-postings-carry-spine-link.mjs"]);
  },
};
