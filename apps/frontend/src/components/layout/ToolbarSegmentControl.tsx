/**
 * C-01 — ToolbarSegmentControl is now a thin alias of the house SegmentedControl
 * so view toggles and status toggles share one family (height / padding / min-width / tint).
 */
export {
  SegmentedControl as ToolbarSegmentControl,
  type SegmentedControlOption as ToolbarSegmentOption,
} from "../SegmentedControl";
