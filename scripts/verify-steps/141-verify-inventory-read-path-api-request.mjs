// 0441-mod13-inventory-read-path-raw-fetch — Parts & Stock read must use apiRequest, not raw fetch.
export default {
  name: "inventory-read-path-api-request",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:inventory-read-path-api-request"]) !== 0) {
      process.exit(1);
    }
  },
};
