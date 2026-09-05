import { humanizeEnumLabel } from "./humanizeEnumLabel";

/**
 * OWNER 13:20Z: "Event cells show machine names (dispatch.driver_qualification_overridden_by_owner)
 * — plain-English law." Audit event classes/types are written `<module>.<snake_case_action>` or
 * `<schema>.<entity>.<action>`; a Source/module column elsewhere already renders the module, so this
 * drops the leading module segment and reuses the existing humanizeEnumLabel() (never a second,
 * competing humanizer) on what remains.
 *
 *   "dispatch.driver_qualification_overridden_by_owner" -> "Driver qualification overridden by owner"
 *   "driver_finance.driver_bill.voided"                 -> "Driver bill voided"
 */
export function humanizeAuditEventType(eventType: string): string {
  const withoutModulePrefix = eventType.includes(".") ? eventType.slice(eventType.indexOf(".") + 1) : eventType;
  // humanizeEnumLabel's "already human" guard returns early on ANY whitespace, so a remaining dot
  // (from a schema.entity.action class) must fold into an underscore, not a space, or it would
  // short-circuit back out with the underscore left in place.
  return humanizeEnumLabel(withoutModulePrefix.replace(/\./g, "_")) || eventType;
}
