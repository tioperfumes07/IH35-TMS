import { entityLabel } from "../../lib/entity-label";
import { EntityLink, type EntityKind } from "../shared/EntityLink";

// TASKS-PLANNER-V2-CONNECTIVITY: task.subject_type/subject_id already carries the record this task
// is about (set at create time via CreateTaskModal's EntityPicker/ReferenceSelect — see
// api/tasks.ts's TaskLinkInput), but nothing in the module rendered it anywhere: the board/mine/
// calendar/drawer views showed a task's title and dates only, with no drill-through to the driver/
// unit/load it was actually about — a write-only feature. Only map subject_type values that have a
// real EntityLink route; task subject types with no EntityKind (purchase/policy/document) fall back
// to plain text rather than fabricate a route.
const TASK_SUBJECT_ENTITY_KIND: Partial<Record<string, EntityKind>> = {
  vendor: "vendor",
  customer: "customer",
  unit: "unit",
  driver: "driver",
  expense: "expense",
  bill: "bill",
  bill_payment: "bill_payment",
  work_order: "work_order",
  load: "load",
  settlement: "settlement",
};

export function TaskSubjectLink({ subjectType, subjectId }: { subjectType: string | null; subjectId: string | null }) {
  if (!subjectType || !subjectId) return null;
  const kind = TASK_SUBJECT_ENTITY_KIND[subjectType];
  if (!kind) return <span className="capitalize">{subjectType}</span>;
  return <EntityLink kind={kind} id={subjectId} label={entityLabel(null, subjectId, subjectType)} />;
}
