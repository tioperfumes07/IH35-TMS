import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/useAuth";
import { useCompanyContext } from "../contexts/CompanyContext";
import {
  checkReturningDispatcher,
  createIdentityWorkflow,
  createUser,
  deactivateUser,
  IDENTITY_ROLE_CHANGE_ACTION_CODE,
  listUsers,
  type ReturningDispatcherDetectionResult,
} from "../api/identity";
import { Button } from "../components/Button";
import { CappedListNotice } from "../components/CappedListNotice";
import { Combobox } from "../components/Combobox";
import { ParityTable, type ParityColumn } from "../components/parity/ParityTable";
import { KpiCard } from "../components/layout/KpiCard";
import { KpiStrip } from "../components/layout/KpiStrip";
import { PageHeader } from "../components/layout/PageHeader";
import { Modal } from "../components/Modal";
import { ActionButton } from "../components/shared/ActionButton";
import { EntityLinkOrTombstone } from "../components/shared/EntityLinkOrTombstone";
import { NavyPageSubNav } from "../components/layout/NavyPageSubNav";
import { StatusBadge } from "../components/StatusBadge";
import { companyToday } from "../lib/businessDate";
import { useToast } from "../components/Toast";
import { SaveDropdown } from "../components/forms/SaveDropdown";
import { useBulkSelection } from "../hooks/useBulkSelection";
import { useUrlSort } from "../hooks/useUrlSort";
import { ListErrorBanner } from "../components/shared/ListErrorBanner";
import { SelectCombobox } from "../components/shared/SelectCombobox";
import { CollapsedListFilters, useStagedListFilters } from "../components/table";
import { useUnsavedChanges } from "../hooks/useUnsavedChanges";
import { evaluatePasswordStrength, OFFICE_PASSWORD_HINT } from "../auth/office-password-ui";
import { parseApiErrorPayload } from "../components/forms/useFormValidation";
import { formatDateTimeUS } from "../lib/formatDate";
import { entityLabel } from "../lib/entity-label";
import { formatLastLoginAt } from "../lib/formatLastLoginAt";
import { colors } from "../design/tokens";
import type { IdentityUser, UserRole } from "../types/api";
import { isInvitePending, userStatus } from "../lib/user-status";
import { getAdminJob, triggerDeactivateProbeAccounts } from "../api/admin-jobs";
import { ConfirmModal } from "../components/shared/ConfirmModal";

const ROLE_OPTIONS: Array<UserRole | "Viewer"> = [
  "Owner",
  "Administrator",
  "Manager",
  "Accountant",
  "Dispatcher",
  "Safety",
  "Driver",
  "Mechanic",
  "Viewer",
];
const ROLE_LABEL: Record<UserRole | "Viewer", string> = {
  Owner: "Owner",
  Administrator: "Administrator",
  SuperAdmin: "Super Admin",
  Manager: "Manager",
  Accountant: "Accounting",
  Dispatcher: "Dispatcher",
  Safety: "Safety",
  Driver: "Driver",
  Mechanic: "Mechanic",
  Viewer: "Viewer",
};
// Viewer is a future-phase role: submitInvite() always rejects it with a "future phase" toast, so it must
// never be selectable in the Create User combobox (was a dead-end pick). Mirrors the exclusion already
// applied to roleChangeComboboxOptions below.
const roleComboboxOptions = ROLE_OPTIONS.filter((role) => role !== "Viewer").map((role) => ({
  value: role,
  label: ROLE_LABEL[role],
}));
const roleChangeComboboxOptions = ROLE_OPTIONS.filter((role): role is UserRole => role !== "Viewer").map((role) => ({
  value: role,
  label: ROLE_LABEL[role],
}));

const USER_TAB_IDS = ["all", "active", "pending", "deactivated"] as const;
type UserListTabId = (typeof USER_TAB_IDS)[number];
const PENDING_INVITE_DAYS = 7;
type ProvisionMode = "set_password" | "send_invite";

function parseUserListTab(searchParams: URLSearchParams): UserListTabId {
  const raw = (searchParams.get("tab") ?? "all").toLowerCase();
  return (USER_TAB_IDS as readonly string[]).includes(raw) ? (raw as UserListTabId) : "all";
}

function daysSince(iso: string): number {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / (1000 * 60 * 60 * 24);
}

function userRowCategory(user: IdentityUser): "active" | "pending" | "deactivated" {
  if (user.deactivated_at) return "deactivated";
  if (isInvitePending(user) || daysSince(user.created_at) < PENDING_INVITE_DAYS) return "pending";
  return "active";
}

const PASSWORD_CHECKLIST = [
  { key: "length", label: "At least 12 characters", test: (value: string) => value.length >= 12 },
  { key: "lower", label: "Lowercase letter", test: (value: string) => /[a-z]/.test(value) },
  { key: "upper", label: "Uppercase letter", test: (value: string) => /[A-Z]/.test(value) },
  { key: "number", label: "Number", test: (value: string) => /[0-9]/.test(value) },
  { key: "symbol", label: "Symbol", test: (value: string) => /[^A-Za-z0-9]/.test(value) },
] as const;

function PasswordChecklist({ password }: { password: string }) {
  return (
    <ul className="mt-2 space-y-1 text-xs" aria-live="polite">
      {PASSWORD_CHECKLIST.map((item) => {
        const met = item.test(password);
        return (
          <li key={item.key} className={met ? "text-slate-700" : "text-gray-500"}>
            {met ? "✓" : "○"} {item.label}
          </li>
        );
      })}
    </ul>
  );
}

export function UsersPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const auth = useAuth();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleModalUser, setRoleModalUser] = useState<IdentityUser | null>(null);
  const [inviteRole, setInviteRole] = useState<UserRole | "Viewer">("Manager");
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteInitialPassword, setInviteInitialPassword] = useState("");
  const [provisionMode, setProvisionMode] = useState<ProvisionMode>("send_invite");
  const [overrideReturningWarning, setOverrideReturningWarning] = useState(false);
  const [returningDetection, setReturningDetection] = useState<ReturningDispatcherDetectionResult | null>(null);
  const [checkingReturningDispatcher, setCheckingReturningDispatcher] = useState(false);
  const [returningCheckError, setReturningCheckError] = useState<string | null>(null);
  const [roleChangeRole, setRoleChangeRole] = useState<UserRole>("Manager");
  const [roleApproverId, setRoleApproverId] = useState("");
  const [roleReason, setRoleReason] = useState("");
  const [inviteBaseline, setInviteBaseline] = useState({
    inviteName: "",
    inviteEmail: "",
    inviteRole: "Manager" as UserRole | "Viewer",
    inviteInitialPassword: "",
    provisionMode: "send_invite" as ProvisionMode,
    overrideReturningWarning: false,
  });
  const [roleBaseline, setRoleBaseline] = useState({ roleChangeRole: "Manager" as UserRole, roleReason: "" });
  const returningWarningRef = useRef<HTMLDivElement | null>(null);
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompanyContext();
  const userBulk = useBulkSelection({ cap: 200, onCapExceeded: (error) => pushToast(error.message, "error") });
  const paritySelectedKeys = useMemo(() => [...userBulk.selectedIds], [userBulk.selectedIds]);
  const { sortKey, sortDirection, onSortChange } = useUrlSort();
  const queryClient = useQueryClient();
  const isOwnerOrAdmin = auth.user?.role === "Owner" || auth.user?.role === "Administrator";
  const isOwner = auth.user?.role === "Owner";
  const [probeJobId, setProbeJobId] = useState<string | null>(null);
  const deactivateGenerationRef = useRef(0);
  const [pendingDeactivate, setPendingDeactivate] = useState<{
    userId: string;
    userName: string;
    companyId: string | null;
    generation: number;
  } | null>(null);

  const probeJobQuery = useQuery({
    queryKey: ["admin-job", probeJobId],
    queryFn: () => getAdminJob(probeJobId!),
    enabled: !!probeJobId,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return !s || s === "queued" || s === "running" ? 2000 : false;
    },
  });

  const probeMutation = useMutation({
    mutationFn: triggerDeactivateProbeAccounts,
    onSuccess: (data) => {
      setProbeJobId(data.jobId);
      pushToast("Probe-account deactivation job queued", "info");
    },
    onError: () => {
      pushToast("Failed to trigger probe deactivation", "error");
    },
  });
  const listTab = useMemo(() => parseUserListTab(searchParams), [searchParams]);

  const setListTab = (next: UserListTabId) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === "all") p.delete("tab");
        else p.set("tab", next);
        return p;
      },
      { replace: false }
    );
  };

  const roleFilter = (searchParams.get("role") ?? "").trim();
  const setRoleFilter = (next: string) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (!next) p.delete("role");
        else p.set("role", next);
        return p;
      },
      { replace: false },
    );
  };
  const staged = useStagedListFilters({
    applied: { roleFilter },
    empty: { roleFilter: "" },
    onApply: (next) => {
      setRoleFilter(next.roleFilter);
    },
  });

  const usersQuery = useQuery({
    queryKey: ["users", isOwnerOrAdmin],
    queryFn: () => listUsers(isOwnerOrAdmin),
    enabled: Boolean(auth.user),
  });

  const createUserMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      pushToast("User created successfully", "success");
    },
    onError: (error) => {
      console.error("[Users] createUser mutation error:", error);
    },
  });

  const roleWorkflowMutation = useMutation({
    mutationFn: createIdentityWorkflow,
    onSuccess: () => {
      setRoleModalUser(null);
      setRoleApproverId("");
      setRoleReason("");
      pushToast("Role change request submitted for approval", "success");
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (input: { userId: string; userName: string; companyId: string | null; generation: number }) =>
      deactivateUser(input.userId, input.companyId),
    onSuccess: (_result, input) => {
      if (input.generation !== deactivateGenerationRef.current) return;
      queryClient.invalidateQueries({ queryKey: ["users"] });
      pushToast("User deactivated", "info");
    },
    onError: (error, input) => {
      if (input.generation !== deactivateGenerationRef.current) return;
      // Never fail silently — surface the server's reason (no-silent-dead-control rule).
      let message = "Failed to deactivate user";
      if (error instanceof ApiError) {
        const code = (error.data as { error?: string })?.error;
        if (code === "cannot_deactivate_last_owner") message = "Cannot deactivate the last active Owner";
        else if (error.status === 403) message = "You do not have permission to deactivate users";
        else if (code) message = `Deactivate failed: ${code}`;
      }
      pushToast(message, "error");
    },
  });

  useEffect(() => {
    deactivateGenerationRef.current += 1;
    setPendingDeactivate(null);
    deactivateMutation.reset();
  }, [selectedCompanyId]);

  const allUsers = usersQuery.data?.users ?? [];
  // USERS-LIST-SILENT-50-CAP: the backend now returns total_count alongside the page — if it
  // exceeds the fetched page (beyond the 200-row max this page requests), the roster is
  // genuinely truncated and every count below is a floor, not the true total. Disclose it rather
  // than silently presenting allUsers.length as complete.
  const totalUserCount = usersQuery.data?.total_count ?? allUsers.length;
  const roleApproverOptions = useMemo(
    () =>
      allUsers
        .filter((user) => ["Owner", "Administrator"].includes(user.role))
        .filter((user) => !user.deactivated_at)
        // Distinct approver: never the target of the role change, nor the requester.
        .filter((user) => user.id !== roleModalUser?.id && user.id !== auth.user?.uuid)
        .map((user) => ({
          value: user.id,
          label: `${entityLabel(user.name ?? user.email, user.id, "User")} — ${ROLE_LABEL[user.role as UserRole] ?? user.role}`,
        })),
    [allUsers, roleModalUser?.id, auth.user?.uuid]
  );

  const tabCounts = useMemo(() => {
    return {
      // "all" comes from the server's own total_count, not allUsers.length — the backend already
      // knows the true count for the current filters; active/pending/deactivated below are still
      // derived from the fetched page only (no per-category breakdown from the server), so those
      // three remain floors when CappedListNotice below is showing (i.e. totalUserCount > allUsers.length).
      all: totalUserCount,
      active: allUsers.filter((u) => userRowCategory(u) === "active").length,
      pending: allUsers.filter((u) => userRowCategory(u) === "pending").length,
      deactivated: allUsers.filter((u) => userRowCategory(u) === "deactivated").length,
    };
  }, [allUsers, totalUserCount]);

  const invitePasswordStrength = useMemo(
    () => evaluatePasswordStrength(inviteInitialPassword),
    [inviteInitialPassword]
  );
  const invitePasswordReady = provisionMode !== "set_password" || invitePasswordStrength.meetsPolicy;
  const roleRequiresApprover = roleChangeRole === "Owner" || roleChangeRole === "Administrator";

  const userColumns = useMemo<Array<ParityColumn<IdentityUser>>>(
    () => [
      {
        key: "name",
        label: "Name",
        sortable: true,
        render: (row) => (
          <EntityLinkOrTombstone
            data-testid="user-roster-record-link"
            kind="user"
            id={row.id}
            name={row.name}
            noun="User"
            onClick={(event) => event.stopPropagation()}
          />
        ),
      },
      { key: "email", label: "Email", sortable: true, render: (row) => row.email ?? "—" },
      {
        key: "role",
        label: "Role",
        sortable: true,
        render: (row) => ROLE_LABEL[row.role as UserRole] ?? row.role,
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        sortValue: (row) => userStatus(row),
        render: (row) => <StatusBadge status={userStatus(row)} />,
      },
      {
        key: "auth_method",
        label: "Auth method",
        sortable: true,
        sortValue: (row) => row.auth_method ?? "Invite pending",
        render: (row) => row.auth_method ?? "Invite pending",
      },
      {
        key: "last_login",
        label: "Last Login",
        sortable: true,
        sortValue: (row) => row.last_login_at ?? "",
        render: (row) => formatLastLoginAt(row.last_login_at),
      },
      {
        key: "actions",
        label: "Actions",
        sortable: false,
        alwaysVisible: true,
        className: "w-44",
        render: (row) => {
          const isDeactivated = Boolean(row.deactivated_at);
          const permReason = isOwnerOrAdmin ? undefined : "Requires Owner or Administrator role";
          return (
            <div className="flex flex-wrap items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
              <button
                type="button"
                disabled={!isOwnerOrAdmin}
                title={permReason ?? "Change this user's role"}
                aria-label={`Change role for ${row.name}`}
                className="whitespace-nowrap rounded-sm border border-gray-300 px-2 py-1 text-xs text-slate-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={(event) => {
                  event.stopPropagation();
                  setRoleModalUser(row);
                  setRoleChangeRole(row.role);
                }}
              >
                Change Role
              </button>
              <button
                type="button"
                disabled={!isOwnerOrAdmin || isDeactivated || deactivateMutation.isPending}
                title={
                  permReason ?? (isDeactivated ? "User is already deactivated" : "Deactivate this user")
                }
                aria-label={`Deactivate ${row.name}`}
                className="whitespace-nowrap rounded-sm border border-gray-300 px-2 py-1 text-xs text-slate-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={(event) => {
                  event.stopPropagation();
                  setPendingDeactivate({
                    userId: row.id,
                    userName: row.name || "this user",
                    companyId: selectedCompanyId,
                    generation: deactivateGenerationRef.current,
                  });
                }}
              >
                {isDeactivated ? "Deactivated" : "Deactivate"}
              </button>
            </div>
          );
        },
      },
    ],
    [deactivateMutation.isPending, isOwnerOrAdmin],
  );

  const filteredUsers = useMemo(() => {
    let list = [...allUsers];
    // Free-text search: ParityTable toolbar owns it (USR-F3494) — tab filter stays page-local.
    if (listTab === "deactivated") list = list.filter((u) => u.deactivated_at);
    else if (listTab === "pending") list = list.filter((u) => userRowCategory(u) === "pending");
    else if (listTab === "active") list = list.filter((u) => userRowCategory(u) === "active");
    if (roleFilter) list = list.filter((u) => u.role === roleFilter);
    return list;
  }, [allUsers, listTab, roleFilter]);

  const inviteSnapshot = { inviteName, inviteEmail, inviteRole, inviteInitialPassword, provisionMode, overrideReturningWarning };
  const { isDirty: inviteIsDirty } = useUnsavedChanges(inviteSnapshot, inviteBaseline);

  const roleOpen = roleModalUser !== null;
  const roleSnapshot = { roleChangeRole, roleReason };
  const { isDirty: roleIsDirty } = useUnsavedChanges(roleSnapshot, roleBaseline);

  useEffect(() => {
    if (!roleModalUser) return;
    setRoleChangeRole(roleModalUser.role);
    setRoleApproverId("");
    setRoleReason("");
    setRoleBaseline({
      roleChangeRole: roleModalUser.role,
      roleReason: "",
    });
  }, [roleModalUser]);

  useEffect(() => {
    if (!inviteOpen) return;
    const normalizedEmail = inviteEmail.trim().toLowerCase();
    const shouldCheck = normalizedEmail.length >= 5 && inviteRole !== "Owner" && inviteRole !== "Driver" && inviteRole !== "Viewer";
    if (!shouldCheck) {
      setReturningDetection(null);
      setReturningCheckError(null);
      setCheckingReturningDispatcher(false);
      setOverrideReturningWarning(false);
      return;
    }
    const timer = window.setTimeout(async () => {
      setCheckingReturningDispatcher(true);
      setReturningCheckError(null);
      try {
        const result = await checkReturningDispatcher(normalizedEmail);
        setReturningDetection(result.returning_dispatcher ? result : null);
        if (!result.returning_dispatcher) setOverrideReturningWarning(false);
      } catch (error) {
        setReturningDetection(null);
        setReturningCheckError(error instanceof Error ? error.message : "Could not check returning-dispatcher history");
      } finally {
        setCheckingReturningDispatcher(false);
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [inviteEmail, inviteOpen, inviteRole]);

  function resetInviteFields() {
    setInviteName("");
    setInviteEmail("");
    setInviteRole("Manager");
    setInviteInitialPassword("");
    setProvisionMode("send_invite");
    setOverrideReturningWarning(false);
    setReturningDetection(null);
    setInviteBaseline({
      inviteName: "",
      inviteEmail: "",
      inviteRole: "Manager",
      inviteInitialPassword: "",
      provisionMode: "send_invite",
      overrideReturningWarning: false,
    });
  }

  async function submitInvite(closeAfter: boolean) {
    if (checkingReturningDispatcher || returningCheckError) {
      pushToast("Returning-dispatcher history must be checked successfully before creating this user", "error");
      return;
    }
    if (inviteRole === "Viewer") {
      pushToast("Viewer role comes in a future phase", "error");
      return;
    }
    if (!inviteName.trim()) {
      pushToast("Name is required", "error");
      return;
    }
    if (!inviteEmail.trim()) {
      pushToast("Email is required", "error");
      return;
    }
    if (provisionMode === "set_password" && !invitePasswordReady) {
      pushToast(OFFICE_PASSWORD_HINT, "error");
      return;
    }
    if (provisionMode === "set_password" && inviteInitialPassword.trim().length === 0) {
      pushToast("Initial password is required", "error");
      return;
    }
    if (Boolean(returningDetection) && !overrideReturningWarning) {
      returningWarningRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      pushToast("Confirm the returning dispatcher override to continue.", "error");
      return;
    }
    try {
      await createUserMutation.mutateAsync({
        name: inviteName.trim(),
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
        operating_company_id: selectedCompanyId ?? undefined,
        initial_password: provisionMode === "set_password" ? inviteInitialPassword : undefined,
        send_password_setup_invite: provisionMode === "send_invite",
        override_returning_warning: overrideReturningWarning,
      });
      if (closeAfter) {
        setInviteOpen(false);
        resetInviteFields();
      } else {
        resetInviteFields();
      }
    } catch (error) {
      console.error("[Users] submitInvite error:", error);
      if (error instanceof ApiError && error.status === 409 && (error.data as { error?: string })?.error === "returning_dispatcher_detected") {
        const details = error.data as ReturningDispatcherDetectionResult & { error: string };
        setReturningDetection({
          returning_dispatcher: true,
          total_count: details.total_count ?? details.matched_events?.length ?? 0,
          matched_events: details.matched_events ?? [],
          severity_summary: details.severity_summary ?? { severe_count: 0, warning_count: 0, info_count: 0 },
        });
        pushToast("Returning dispatcher detected. Confirm override to continue.", "error");
        setTimeout(() => returningWarningRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
        return;
      }
      if (error instanceof ApiError && (error.status === 409 || (error.data as { error?: string })?.error === "identity_user_conflict")) {
        pushToast("A user with this email already exists", "error");
        return;
      }
      if (error instanceof ApiError && error.status === 400) {
        const body = error.data as { error?: string };
        if (body?.error === "initial_password_or_invite_required") {
          pushToast("Choose a password setup method", "error");
          return;
        }
        if (body?.error === "validation_error") {
          const parsed = parseApiErrorPayload(error.data);
          pushToast(parsed.message ?? OFFICE_PASSWORD_HINT, "error");
          return;
        }
        pushToast(`Create user failed: ${body?.error ?? "bad request"}`, "error");
        return;
      }
      pushToast("Failed to create user — check console for details", "error");
    }
  }

  const openInvite = () => {
    if (!selectedCompanyId) {
      pushToast("Select an operating company before creating a user", "error");
      return;
    }
    resetInviteFields();
    setInviteOpen(true);
  };

  // Export the currently-selected users to a real client-side CSV (name/email/role/status/auth/last-login),
  // mirroring the Blob-download pattern used in DriversListPage. Reads the rows already loaded in the table —
  // no backend call, correct per-entity RLS because the list itself was fetched through the session.
  const handleExportSelected = () => {
    const selectedRows = filteredUsers.filter((row) => userBulk.selectedIds.has(row.id));
    if (selectedRows.length === 0) {
      pushToast("No users selected to export", "info");
      return;
    }
    const esc = (value: unknown) => {
      const s = value == null ? "" : String(value);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ["Name", "Email", "Role", "Status", "Auth method", "Last login"];
    const lines = selectedRows.map((row) =>
      [
        row.name ?? "",
        row.email ?? "",
        ROLE_LABEL[row.role as UserRole] ?? row.role,
        userStatus(row),
        row.auth_method ?? "Invite pending",
        formatLastLoginAt(row.last_login_at),
      ]
        .map(esc)
        .join(",")
    );
    const csv = [header.map(esc).join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `IH35-users-${companyToday()}.csv`;
    anchor.click();
    URL.revokeObjectURL(href);
  };

  return (
    <div className="mx-auto w-full max-w-[min(1280px,calc(100vw-2rem))] space-y-3">
      <PageHeader title="Users" subtitle={`${filteredUsers.length} records`} actions={<ActionButton onClick={openInvite}>+ Create User</ActionButton>} />

      {/* USERS-LIST-SILENT-50-CAP: this page fetches at most 200 users; below this, only the
          Total-users KPI (which reads the server's own total_count) stays accurate beyond that —
          the active/pending/deactivated splits and the on-screen rows are still a floor. */}
      <CappedListNotice
        shown={allUsers.length}
        limit={200}
        total={totalUserCount}
        hint="Narrow by role or search to see the rest."
      />

      <KpiStrip>
        {/* B10 dead-click rollout: each card drills into the existing ?tab= list filter (already wired
            below via SecondaryNavTabs/parseUserListTab) — no new filter logic, just exposing it on the KPI. */}
        <KpiCard label="Total users" number={tabCounts.all} accent={colors.info.strong} to="/users" />
        <KpiCard label="Active" number={tabCounts.active} accent={colors.positive.strong} to="/users?tab=active" />
        <KpiCard label="Pending (new)" number={tabCounts.pending} accent={colors.warn.strong} to="/users?tab=pending" />
        <KpiCard label="Deactivated" number={tabCounts.deactivated} accent={colors.crit.strong} to="/users?tab=deactivated" />
      </KpiStrip>

      <NavyPageSubNav
        activeId={listTab}
        onTabChange={(id) => {
          if ((USER_TAB_IDS as readonly string[]).includes(id)) setListTab(id as UserListTabId);
        }}
        items={[
          { label: `All (${tabCounts.all})`, to: "#all" },
          { label: `Active (${tabCounts.active})`, to: "#active" },
          { label: `Pending (${tabCounts.pending})`, to: "#pending" },
          { label: `Deactivated (${tabCounts.deactivated})`, to: "#deactivated" },
        ]}
        itemIds={["all", "active", "pending", "deactivated"]}
      />

      {usersQuery.isError ? <ListErrorBanner onRetry={() => void usersQuery.refetch()} /> : null}

      <ParityTable<IdentityUser>
        columns={userColumns}
        rows={filteredUsers}
        rowKey={(row) => row.id}
        loading={usersQuery.isLoading}
        emptyText="No users found."
        storageKey="users-list"
        tableTestId="users-list-table"
        onRowClick={(row) => navigate(`/users/${row.id}`)}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={onSortChange}
        enableColumnResize
        selectable
        maxSelectable={userBulk.cap}
        onSelectionCapExceeded={() =>
          pushToast("You can select up to 200 items at a time. Clear some selections and try again.", "error")
        }
        selectedKeys={paritySelectedKeys}
        onSelectionChange={(keys) => userBulk.setSelectedIds(new Set(keys))}
        hidePager
        filterBar={
          <div data-users-filter-toolbar="collapsed" data-testid="users-root-filter-panel">
            <CollapsedListFilters
              activeFilterCount={roleFilter ? 1 : 0}
              onApply={staged.apply}
              onReset={staged.reset}
              onCancel={staged.cancel}
              applyDisabled={!staged.dirty}
              testIdPrefix="users"
            >
              <div className="flex flex-wrap items-end gap-3">
                <label className="space-y-1 text-xs text-gray-600" data-testid="users-filter-role">
                  <span>Role</span>
                  <SelectCombobox
                    className="min-h-12 w-full min-w-[12rem] rounded-sm border border-gray-300 px-2 text-sm sm:h-9 sm:min-h-0"
                    value={staged.draft.roleFilter}
                    onChange={(event) => staged.setDraft({ ...staged.draft, roleFilter: event.target.value })}
                  >
                    <option value="">All roles</option>
                    {ROLE_OPTIONS.filter((role) => role !== "Viewer").map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABEL[role]}
                      </option>
                    ))}
                  </SelectCombobox>
                </label>
              </div>
            </CollapsedListFilters>
          </div>
        }
        batchActions={() => (
          <div className="flex flex-wrap gap-2">
            {/* Bulk deactivate is intentionally omitted — per-row Deactivate in Actions is the live path.
                A disabled "Coming soon" bulk control fails verify:no-prod-stubs. */}
            <button
              type="button"
              className="rounded-sm border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
              title="Download selected users as CSV"
              onClick={handleExportSelected}
            >
              Export Selected
            </button>
          </div>
        )}
      />

      <Modal
        variant="drawer"
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Create User"
        confirmDiscardOnClose
        isDirty={inviteIsDirty}
      >
        <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Name</label>
            <input
              value={inviteName}
              onChange={(event) => setInviteName(event.target.value)}
              required
              type="text"
              className="w-full rounded-sm border border-gray-300 h-9 px-2 text-[13px]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Email</label>
            <input
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              required
              type="email"
              className="w-full rounded-sm border border-gray-300 h-9 px-2 text-[13px]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Role</label>
            <Combobox
              options={roleComboboxOptions}
              value={inviteRole}
              onChange={(value) => setInviteRole((value as UserRole | "Viewer") ?? "Manager")}
              placeholder="Select role"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Password setup</label>
            <div className="space-y-2 border-t border-gray-200 pt-2 text-xs text-gray-700">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="password-setup-mode"
                  checked={provisionMode === "send_invite"}
                  onChange={() => setProvisionMode("send_invite")}
                />
                Email invite to set password
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="password-setup-mode"
                  checked={provisionMode === "set_password"}
                  onChange={() => setProvisionMode("set_password")}
                />
                Set initial password now
              </label>
            </div>
          </div>
          {provisionMode === "set_password" ? (
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">Initial password</label>
              <input
                value={inviteInitialPassword}
                onChange={(event) => setInviteInitialPassword(event.target.value)}
                type="password"
                autoComplete="new-password"
                className="w-full rounded-sm border border-gray-300 h-9 px-2 text-[13px]"
              />
              <PasswordChecklist password={inviteInitialPassword} />
              {!invitePasswordReady ? (
                <p className="mt-1 text-xs text-slate-700">{OFFICE_PASSWORD_HINT}</p>
              ) : null}
            </div>
          ) : null}
          {checkingReturningDispatcher ? <div className="text-xs text-gray-500">Checking returning dispatcher history...</div> : null}
          {returningCheckError ? (
            <p role="alert" className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              Returning-dispatcher check failed: {returningCheckError}. Change the email to retry.
            </p>
          ) : null}
          {returningDetection ? (
            <div ref={returningWarningRef} className="rounded-sm border-2 border-slate-400 bg-slate-100 p-3 text-xs text-slate-700">
              <p className="flex items-center gap-1.5 font-semibold text-slate-700">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Returning dispatcher detected — review required
              </p>
              <p className="mt-1">
                {returningDetection.total_count} prior safety event{returningDetection.total_count !== 1 ? "s" : ""}:{" "}
                {returningDetection.severity_summary.severe_count} severe, {returningDetection.severity_summary.warning_count} warning,{" "}
                {returningDetection.severity_summary.info_count} info
              </p>
              <label className="mt-2 inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={overrideReturningWarning}
                  onChange={(event) => setOverrideReturningWarning(event.target.checked)}
                />
                <span>I acknowledge this history — create user anyway</span>
              </label>
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <SaveDropdown
              storageKey="users-invite"
              primaryLabel={provisionMode === "send_invite" ? "Create and send invite" : "Create user"}
              loading={createUserMutation.isPending}
              disabled={createUserMutation.isPending || checkingReturningDispatcher || Boolean(returningCheckError)}
              onSave={() => void submitInvite(false)}
              onSaveAndClose={() => void submitInvite(true)}
            />
          </div>
        </form>
      </Modal>

      <Modal
        open={roleOpen}
        onClose={() => setRoleModalUser(null)}
        title="Change Role"
        confirmDiscardOnClose
        isDirty={roleIsDirty}
      >
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!roleModalUser) return;
            if (roleRequiresApprover && !roleApproverId) {
              pushToast("Select an approver for this role change", "error");
              return;
            }
            if (
              roleRequiresApprover &&
              (roleApproverId === roleModalUser.id || roleApproverId === auth.user?.uuid)
            ) {
              pushToast("Approver must be distinct from the requester and target", "error");
              return;
            }
            try {
              await roleWorkflowMutation.mutateAsync({
                action_code: IDENTITY_ROLE_CHANGE_ACTION_CODE,
                target_user: roleModalUser.id,
                payload: {
                  new_role: roleChangeRole,
                  reason: roleReason.trim() || undefined,
                  required_approver_user_id: roleRequiresApprover ? roleApproverId : undefined,
                },
              });
            } catch {
              pushToast("Failed to submit role-change workflow", "error");
            }
          }}
        >
          <div className="text-sm text-gray-600">
            Current role:{" "}
            {roleModalUser?.role
              ? (ROLE_LABEL[roleModalUser.role as UserRole] ?? roleModalUser.role)
              : "—"}
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">New role</label>
            <Combobox
              options={roleChangeComboboxOptions}
              value={roleChangeRole}
              onChange={(value) => setRoleChangeRole((value as UserRole) ?? "Manager")}
              placeholder="Select role"
            />
          </div>
          {roleRequiresApprover ? (
            <div data-testid="user-role-required-approver">
              <label className="mb-1 block text-xs font-semibold text-gray-600">Required approver</label>
              <Combobox
                options={roleApproverOptions}
                value={roleApproverId}
                onChange={(value) => setRoleApproverId(value ?? "")}
                placeholder="Select approver"
              />
              <p className="mt-1 text-xs text-slate-600">
                Policy-sensitive role changes require a distinct approver before submission.
              </p>
            </div>
          ) : null}
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Reason (optional)</label>
            <textarea
              value={roleReason}
              onChange={(event) => setRoleReason(event.target.value)}
              rows={3}
              className="w-full rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setRoleModalUser(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={roleWorkflowMutation.isPending} disabled={roleRequiresApprover && !roleApproverId}>
              Submit Request
            </Button>
          </div>
        </form>
      </Modal>

      {isOwner ? (
        <section className="mt-6 overflow-hidden rounded-sm border border-slate-200 bg-white">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <h3 className="mb-1 text-sm font-semibold text-slate-700">Admin Tools</h3>
            <p className="text-xs text-slate-500">Owner-only maintenance actions.</p>
          </div>
          <div className="flex items-start justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-700">Deactivate Probe Accounts</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Deactivates CI/test fixture accounts still live in production. Idempotent — runs at most
                once per UTC day per requesting user.
              </p>
              {probeJobId && probeJobQuery.data ? (
                <p className="mt-1 text-xs text-slate-500">
                  Job {entityLabel(null, probeJobId, "Job")}{" "}
                  <span
                    className={
                      probeJobQuery.data.status === "completed"
                        ? "font-medium text-slate-700"
                        : probeJobQuery.data.status === "failed"
                          ? "font-medium text-red-600"
                          : "text-slate-400"
                    }
                  >
                    {probeJobQuery.data.status}
                  </span>
                  {probeJobQuery.data.completedAt
                    ? ` — finished ${formatDateTimeUS(probeJobQuery.data.completedAt)}`
                    : ""}
                </p>
              ) : probeJobId && !probeJobQuery.data ? (
                <p className="mt-1 text-xs text-slate-400">Checking job status&hellip;</p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="secondary"
              loading={
                probeMutation.isPending ||
                (!!probeJobId &&
                  (probeJobQuery.data?.status === "queued" || probeJobQuery.data?.status === "running"))
              }
              disabled={
                probeMutation.isPending ||
                (!!probeJobId &&
                  (probeJobQuery.data?.status === "queued" || probeJobQuery.data?.status === "running"))
              }
              onClick={() => probeMutation.mutate()}
            >
              Run
            </Button>
          </div>
        </section>
      ) : null}

      <ConfirmModal
        open={Boolean(pendingDeactivate)}
        title="Deactivate this user?"
        message={pendingDeactivate ? `${pendingDeactivate.userName} will no longer be able to sign in.` : ""}
        confirmLabel="Deactivate user"
        danger
        onClose={() => setPendingDeactivate(null)}
        onConfirm={async () => {
          if (!pendingDeactivate) return;
          await deactivateMutation.mutateAsync(pendingDeactivate);
        }}
      />
    </div>
  );
}
