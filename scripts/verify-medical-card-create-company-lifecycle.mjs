#!/usr/bin/env node
import fs from "node:fs";

const source = fs.readFileSync("apps/frontend/src/components/safety/MedicalCardsHistorySection.tsx", "utf8");

function inspect(value) {
  const failures = [];
  const checks = [
    [/companyGenerationRef = useRef\(0\)/, "missing company generation"],
    [/mutationFn: \(input: \{[\s\S]*companyId: string;[\s\S]*generation: number;[\s\S]*driverId: string;/, "create input is not snapshotted"],
    [/createSafetyMedicalCard\(input\.companyId/, "create uses mutable company"],
    [/driver_id: input\.driverId/, "driver FK is not snapshotted"],
    [/input\.generation !== companyGenerationRef\.current/, "stale success is not rejected"],
    [/queryKey: \["safety", "medical-cards", input\.companyId\]/, "wrong company cache can refresh"],
    [/companyGenerationRef\.current \+= 1[\s\S]*createMutation\.reset\(\)[\s\S]*setOpen\(false\)[\s\S]*setSelectedDriverId\(driverId \?\? ""\)/, "company switch leaves stale workflow"],
    [/createMutation\.variables\?\.generation === companyGenerationRef\.current/, "stale error can leak"],
    [/onSuccess:[\s\S]*companyGenerationRef\.current \+= 1[\s\S]*setSelectedDriverId\(driverId \?\? ""\)[\s\S]*setCardNumber\(""\)[\s\S]*setIssuedDate\(companyToday\(\)\)[\s\S]*setExpiryDate\(""\)[\s\S]*setNotes\(""\)/, "success does not retire the request and fully reset the draft"],
    [/const closeCreate = \(\) => \{[\s\S]*if \(createMutation\.isPending\) return;[\s\S]*setOpen\(false\)/, "pending create can be dismissed"],
    [/const isCreateDirty =[\s\S]*selectedDriverId !== \(driverId \?\? ""\)[\s\S]*Boolean\(cardNumber\.trim\(\)\)[\s\S]*issuedDate !== companyToday\(\)[\s\S]*Boolean\(expiryDate\)[\s\S]*Boolean\(notes\.trim\(\)\)/, "dirty predicate does not cover every editable field"],
    [/<Modal variant="drawer" open=\{open\} onClose=\{closeCreate\}[^>]*confirmDiscardOnClose[^>]*isDirty=\{isCreateDirty\}[^>]*onRegisterAttemptClose=\{setAttemptClose\}/, "drawer does not use the shared discard-confirmation boundary"],
    [/<Button type="button" size="sm" variant="secondary" onClick=\{attemptClose\} disabled=\{createMutation\.isPending\}>Cancel<\/Button>/, "Cancel bypasses the registered close attempt or remains enabled while pending"],
    [/<DriverPickerWithCreate[\s\S]*operatingCompanyId=\{operatingCompanyId\}/, "driver picker is not canonical/scoped"],
    [/<EntityLink kind="driver" id=\{row\.driver_id\}/, "driver reverse link is missing"],
  ];
  for (const [pattern, message] of checks) if (!pattern.test(value)) failures.push(message);
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    "companyGenerationRef = useRef(0)",
    "createSafetyMedicalCard(input.companyId",
    "driver_id: input.driverId",
    "input.generation !== companyGenerationRef.current",
    '["safety", "medical-cards", input.companyId]',
    "companyGenerationRef.current += 1",
    "if (createMutation.isPending) return",
    "confirmDiscardOnClose",
    "onRegisterAttemptClose={setAttemptClose}",
    "onClick={attemptClose} disabled={createMutation.isPending}",
  ];
  for (const token of mutations) {
    if (!source.includes(token)) throw new Error(`fixture missing ${token}`);
    if (inspect(source.split(token).join("REMOVED_BY_SELFTEST")).length === 0) throw new Error(`missed ${token}`);
  }
  console.log(`verify-medical-card-create-company-lifecycle --selftest PASS (${mutations.length}/${mutations.length})`);
} else {
  const failures = inspect(source);
  if (failures.length) {
    failures.forEach((failure) => console.error(` - ${failure}`));
    process.exit(1);
  }
  console.log("verify-medical-card-create-company-lifecycle PASS — create is company-stable with canonical driver linkage");
}
