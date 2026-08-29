#!/usr/bin/env node
import { readFileSync } from "node:fs";

const source = readFileSync("apps/backend/src/mdata/drivers.routes.ts", "utf8");

function verify(s = source) {
  const failures = [];
  const start = s.indexOf('const nextPhone = "phone" in b');
  const end = s.indexOf("const changes = buildPatchChanges", start);
  const mirror = start >= 0 && end > start ? s.slice(start, end) : "";
  if (!/const identityPhone = await client\.query<\{ id: string \}>[\s\S]*UPDATE identity\.users[\s\S]*SET phone = \$2[\s\S]*WHERE id = \$1[\s\S]*RETURNING id::text/.test(mirror)) failures.push("phone mirror must return identity");
  if (!/identityPhone\.rows\[0\]\?\.id !== identityUserId[\s\S]*E_DRIVER_IDENTITY_MIRROR_WRITE_CONFLICT/.test(mirror)) failures.push("phone mirror must reject lost identity");
  if (!/const identityLanguage = await client\.query<\{ id: string \}>[\s\S]*SET preferred_language = \$2[\s\S]*WHERE id = \$1[\s\S]*RETURNING id::text/.test(mirror)) failures.push("language mirror must return identity");
  if (!/identityLanguage\.rows\[0\]\?\.id !== identityUserId[\s\S]*E_DRIVER_IDENTITY_MIRROR_WRITE_CONFLICT/.test(mirror)) failures.push("language mirror must reject lost identity");
  if (!/code === "E_DRIVER_IDENTITY_MIRROR_WRITE_CONFLICT"[\s\S]*reply\.code\(409\)/.test(s)) failures.push("mounted PATCH must map conflict to 409");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("const identityPhone = await client.query<{ id: string }>", "await client.query"),
    source.replace("identityPhone.rows[0]?.id !== identityUserId", "false"),
    source.replace("const identityLanguage = await client.query<{ id: string }>", "await client.query"),
    source.replace("identityLanguage.rows[0]?.id !== identityUserId", "false"),
    source.replace('code === "E_DRIVER_IDENTITY_MIRROR_WRITE_CONFLICT"', "false"),
  ];
  mutations.forEach((mutation, index) => {
    if (mutation === source || verify(mutation).length === 0) throw new Error(`selftest mutation escaped: ${index + 1}`);
  });
  console.log("[verify-driver-identity-mirror-write-identity] SELFTEST PASS (5/5)");
}

const failures = verify();
if (failures.length) {
  console.error("[verify-driver-identity-mirror-write-identity] FAIL");
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}
console.log("[verify-driver-identity-mirror-write-identity] PASS");
