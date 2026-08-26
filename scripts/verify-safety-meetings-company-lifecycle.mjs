#!/usr/bin/env node
/**
 * @matrix-built {"modules":["safety"],"cols":["driver","connectivity","reverse_link","qbo_chrome"],"leaves":["safety.meetings.list","safety.modal.meeting_create","safety.panel.meeting_attendance"],"task":"CLASS-F6545-SAFETY-MEETINGS-COMPANY-LIFECYCLE","vertical":"class-sweep"}
 */
import fs from "node:fs";
import process from "node:process";
const FILE = "apps/frontend/src/pages/safety/SafetyMeetingsPage.tsx";
function inspect(source) {
  const errors = [];
  if (!/useEffect\(\(\) => \{[\s\S]*createMutation\.reset\(\)[\s\S]*attendanceMutation\.reset\(\)[\s\S]*setCreateOpen\(false\)[\s\S]*setTopic\(""\)[\s\S]*setMeetingDate\(companyToday\(\)\)[\s\S]*setRequiredAttendees\(\[\]\)[\s\S]*setAttendeePick\(null\)[\s\S]*setExpandedMeetingId\(null\)[\s\S]*\}, \[operatingCompanyId\]\)/.test(source)) errors.push("company transition does not reset meeting creator/attendance lifecycle");
  if (!/createSafetyMeeting\(input\.companyId, input\.payload\)/.test(source)) errors.push("meeting create does not snapshot company and payload");
  if (!/syncSafetyMeetingAttendance\(input\.companyId, \{[\s\S]*meeting_id: input\.meetingId[\s\S]*meeting_title: input\.meetingTitle[\s\S]*driver_id: input\.driverId[\s\S]*attended: input\.attended/.test(source)) errors.push("attendance does not snapshot company/meeting/driver/value");
  const generationGuards = source.match(/input\.generation !== lifecycleGenerationRef\.current/g)?.length ?? 0;
  if (generationGuards !== 2) errors.push("create and attendance success must reject stale company responses");
  if (!source.includes('["safety", "meetings", input.companyId]')) errors.push("success refresh is not pinned to submitting company");
  if (!/payload: \{[\s\S]*topic: topic\.trim\(\)[\s\S]*meeting_date: meetingDate[\s\S]*required_attendees: \[\.\.\.requiredAttendees\]/.test(source)) errors.push("creator does not snapshot every visible field and driver FK list");
  if (!source.includes('kind="driver"') || !source.includes("<EntityPicker") || !source.includes("<EntityLink")) errors.push("canonical driver picker/forward/reverse wiring removed");
  return errors;
}
if (process.argv.includes("--selftest")) {
  const source = fs.readFileSync(FILE, "utf8");
  const mutations = [
    source.replace("createMutation.reset();", "// planted: creator survives"),
    source.replace("createSafetyMeeting(input.companyId, input.payload)", "createSafetyMeeting(operatingCompanyId, input.payload)"),
    source.replace("syncSafetyMeetingAttendance(input.companyId", "syncSafetyMeetingAttendance(operatingCompanyId"),
    source.replace("input.generation !== lifecycleGenerationRef.current", "false"),
    source.replace("required_attendees: [...requiredAttendees]", "required_attendees: []"),
  ];
  const missed = mutations.filter((candidate) => inspect(candidate).length === 0);
  if (missed.length) {
    console.error(`verify-safety-meetings-company-lifecycle SELFTEST FAIL — ${missed.length}/5 mutation(s) survived`);
    process.exit(1);
  }
  console.log("verify-safety-meetings-company-lifecycle selftest PASS — 5/5 planted defects rejected");
  process.exit(0);
}
const errors = inspect(fs.readFileSync(FILE, "utf8"));
if (errors.length) {
  console.error("verify-safety-meetings-company-lifecycle FAIL:\n" + errors.map((error) => `  - ${error}`).join("\n"));
  process.exit(1);
}
console.log("verify-safety-meetings-company-lifecycle PASS — meeting actions are company-local");
