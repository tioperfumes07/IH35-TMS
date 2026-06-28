export default {
  name: "verify-deprecated-schema-creates",
  run: async (ctx) => {
    // Static: no NEW CREATE TABLE in a deprecated schema (ratchet; consolidation = CAS-04).
    if (ctx.run("npm", ["run", "verify:deprecated-schema-creates"]) !== 0) process.exit(1);
  },
};
