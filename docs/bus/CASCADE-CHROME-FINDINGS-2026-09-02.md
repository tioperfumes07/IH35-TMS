# CASCADE-CHROME-FINDINGS-2026-09-02

**USMCA only** (`5c854333-6ea5-4faa-af31-67cb272fef80`) — Chrome dispatch calendar sweep on `main` `498902bb05` (#19810). `npm run dev` was running on `http://localhost:5173/` and a Chromium browser was opened via `mcp0_browser`. The app redirected to `/login` because no authenticated USMCA session exists. Without a login, the dispatch calendar surfaces could not be rendered. The source components were read and the potential dead-calendar / trap defects below were identified.

---

## Chrome access blocker

- **URL:** `https://app.ih35dispatch.com/` → redirected to `https://app.ih35dispatch.com/login`
- **DOM read proof:** `mcp0_browser` snapshot at `var/folders/gh/r48zdj1d58jb61cjbjkcf05m0000gn/T/.playwright-mcp/page-2026-09-03T02-49-26-285Z.yml`
- **What the browser showed:** heading "IH 35 Office Login", "Sign in with Google" link, Email/Password fields, "Sign in with email" button.
- **Why it matters:** The Playwright browser is NOT the owner’s already-authenticated Chrome — `app.ih35dispatch.com` requires a session, and I do not have credentials. No passwords were asked.

---

## F1 — `PlannerCalendarPage.tsx:211-242` — no date picker, dead week navigation

**What it is:** The planner calendar header renders only `Previous week`, `Next week`, `HOS overlay` and `Load Templates` buttons. There is no date-input or QuickBooks-format `DatePicker` to jump to a specific week.

**file:line:** `apps/frontend/src/pages/dispatch/PlannerCalendarPage.tsx:211-242`

**Chrome proof:** Could not be observed in the browser because the app did not let me past `/login`.

**Correct target behavior:** Add a shared `DatePicker` in the `PageHeader` actions that writes to the `weekStart` state (and optionally to the URL `?week=` parameter), using the same QuickBooks-format calendar the owner approved.

---

## F2 — `PlannerCalendarPage.tsx:82-100` — day cells are not selectable

**What it is:** `PlannerDayCell` is a `<td>` that is a `useDroppable` target for drag-and-drop rescheduling, but it has no `onClick`, no `tabIndex`, and no keyboard selection behavior. A user cannot click a day to inspect, select, or act on it; it is a dead calendar surface.

**file:line:** `apps/frontend/src/pages/dispatch/PlannerCalendarPage.tsx:82-100`

**Chrome proof:** Could not be observed in the browser because the app did not let me past `/login`.

**Correct target behavior:** Each day cell should be focusable and clickable (keyboard and mouse) to surface day-level details or a context menu for the driver/day, consistent with the mounted-wizard picker behavior.

---

## F3 — `TasksCalendarPage.tsx:106-130` — task calendar day cells are not clickable

**What it is:** The month grid in `TasksCalendarPage` renders day cells as `<div>`s that display tasks and a "+N more" indicator, but they do not have any `onClick` or focus handler. A user cannot click a day to see all tasks or create a new one; the calendar is read-only dead.

**file:line:** `apps/frontend/src/pages/tasks/TasksCalendarPage.tsx:106-130`

**Chrome proof:** Could not be observed in the browser because the app did not let me past `/login`.

**Correct target behavior:** Each day cell should be clickable (and focusable) to open the day's task list or a new-task form. The day number and "+N more" text must also be the correct sizes per `GLOBAL-TYPE-SIZE-BASELINE.md`.

---

## F4 — `TasksCalendarPage.tsx:82-98` — no month-level date picker

**What it is:** The task calendar header has `← Prev`, `Today`, and `Next →` buttons only. There is no `DatePicker` or month/year selector to jump to an arbitrary month.

**file:line:** `apps/frontend/src/pages/tasks/TasksCalendarPage.tsx:82-98`

**Chrome proof:** Could not be observed in the browser because the app did not let me past `/login`.

**Correct target behavior:** Add a QuickBooks-format month/year `DatePicker` that sets the `anchor` state, so users can jump to a specific month without repeatedly clicking `Prev` or `Next`.

---

## F5 — `Combobox.tsx:361-405` — `handleKeyDown` does not handle `Tab`, listbox buttons can steal focus

**What it is:** The shared `Combobox` only handles `ArrowDown`, `ArrowUp`, `Enter`, and `Escape` in `handleKeyDown`. It does not handle `Tab`. The listbox is rendered in a portal with `<button role="option">` elements (lines 459-478) that are focusable. If the listbox is open and the user presses `Tab` from the input, focus can land inside the portal instead of the next form field. There is no `Tab` handler in `handleKeyDown` and the listbox buttons do not move focus on `Tab`, so keyboard users can get stuck cycling through options instead of leaving the control. One high-surface call site is `AssignDriverDropdown.tsx:158`.

**file:line:** `apps/frontend/src/components/Combobox.tsx:361-405` and `apps/frontend/src/components/Combobox.tsx:459-478`

**Chrome proof:** Could not be tested on a live USMCA form because the `mcp0_browser` session was unauthenticated (`https://app.ih35dispatch.com/login`).

**Correct target behavior:** `Tab` on the input should close the listbox and move to the next form field. `Tab` inside the listbox should close the listbox and commit or cancel the active selection, then move to the next form field. The `Combobox` should not hold focus in the portal.

---

## Notes for CC-2 / CC-3

- All five findings were derived by READING the source components (`PlannerCalendarPage.tsx`, `TasksCalendarPage.tsx`, and `Combobox.tsx`), not by grepping labels.
- The Chrome surface could not be reached because the Playwright browser is not the owner’s already-authenticated Chrome; `app.ih35dispatch.com` redirected to `/login`. Re-run the same `mcp0_browser` trace on a session that already has a USMCA owner cookie to confirm the rendered behavior.
- No POST, no writes, no money, no purge, no migration was attempted.
