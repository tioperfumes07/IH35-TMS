#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/frontend/src/pages/drivers/MessagesInboxPage.tsx";
let source = fs.readFileSync(file, "utf8");

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["company snapshot", /markDriverMessageRead\(input\.messageId, input\.companyId\)/, "markDriverMessageRead(input.messageId, operatingCompanyId)"],
    ["context generation", /actionGenerationRef\.current \+= 1/, "actionGenerationRef.current = actionGenerationRef.current"],
    ["stale success rejection", /if \(input\.generation !== actionGenerationRef\.current\) return;/, "if (false) return;"],
    ["submitted inbox refresh", /\["drivers", "messages", "inbox", input\.companyId\]/, '["drivers", "messages"]'],
    ["submitted thread refresh", /\["drivers", "messages", "thread", input\.companyId, input\.driverId\]/, '["drivers", "messages", "thread"]'],
    ["stale error rejection", /input\.generation === actionGenerationRef\.current/, "true"],
  ];
  for (const [name, pattern, replacement] of mutations) {
    if (!pattern.test(source)) throw new Error(`selftest fixture missing: ${name}`);
    const mutated = source.replace(pattern, replacement);
    if (verify(mutated).length === 0) throw new Error(`selftest mutation survived: ${name}`);
  }
  console.log(`verify-driver-message-read-company-lifecycle selftest PASS — ${mutations.length}/${mutations.length} planted defects red`);
  process.exit(0);
}

function verify(text) {
  const failures = [];
  if (!text.includes("actionGenerationRef = useRef(0)")) failures.push("action generation ref missing");
  if (!/useEffect\(\(\) => \{[\s\S]{0,180}actionGenerationRef\.current \+= 1;[\s\S]{0,180}setSelectedDriverId\(null\);[\s\S]{0,180}setMarkReadError\(null\);[\s\S]{0,80}\}, \[operatingCompanyId\]\)/.test(text)) failures.push("company transition does not reset message action context");
  if (!/mutationFn: \(input: \{ messageId: string; companyId: string; driverId: string; generation: number \}\) =>[\s\S]{0,100}markDriverMessageRead\(input\.messageId, input\.companyId\)/.test(text)) failures.push("mark-read does not submit immutable message/company/driver/generation context");
  if (!/onSuccess: async \(_result, input\) => \{[\s\S]{0,100}if \(input\.generation !== actionGenerationRef\.current\) return;/.test(text)) failures.push("stale mark-read success is not rejected");
  if (!text.includes('["drivers", "messages", "inbox", input.companyId]')) failures.push("submitted company inbox is not refreshed exactly");
  if (!text.includes('["drivers", "messages", "thread", input.companyId, input.driverId]')) failures.push("submitted company/driver thread is not refreshed exactly");
  if (!/onError: \(error, input\) => \{[\s\S]{0,120}input\.generation === actionGenerationRef\.current/.test(text)) failures.push("stale mark-read error is not rejected");
  if (!/markReadMutation\.mutate\(\{[\s\S]{0,180}companyId: operatingCompanyId,[\s\S]{0,100}driverId: selectedDriverId,[\s\S]{0,100}generation: actionGenerationRef\.current/.test(text)) failures.push("UI does not capture the active message action context");
  if (!text.includes("@matrix-built modules=drivers cols=driver,connectivity,reverse_link")) failures.push("leaf-specific matrix annotation missing");
  return failures;
}

const failures = verify(source);
if (failures.length) {
  console.error(`verify-driver-message-read-company-lifecycle FAIL — ${failures.join("; ")}`);
  process.exit(1);
}
console.log("verify-driver-message-read-company-lifecycle PASS — mark-read is isolated to its submitted company/message/driver lifecycle");
