import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/useAuth";
import {
  checkReturningDispatcher,
  createIdentityWorkflow,
  createUser,
  deactivateUser,
  listUsers,
  type ReturningDispatcherDetectionResult,
} from "../api/identity";
import { Button } from "../components/Button";
import { DataTable } from "../components/DataTable";
import { PageHeader } from "../components/layout/PageHeader";
import { Modal } from "../components/Modal";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import type { IdentityUser, UserRole } from "../types/api";

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

function userStatus(user: IdentityUser): "Active" | "Inactive" {
  return user.deactivated_at ? "Inactive" : "Active";
}

export function UsersPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleModalUser, setRoleModalUser] = useState<IdentityUser | null>(null);
  const [menuUserId, setMenuUserId] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState<UserRole | "Viewer">("Manager");
  const [inviteEmail, setInviteEmail] = useState("");
  const [overrideReturningWarning, setOverrideReturningWarning] = useState(false);
  const [returningDetection, setReturningDetection] = useState<ReturningDispatcherDetectionResult | null>(null);
  const [checkingReturningDispatcher, setCheckingReturningDispatcher] = useState(false);
  const [roleChangeRole, setRoleChangeRole] = useState<UserRole>("Manager");
  const [roleReason, setRoleReason] = useState("");
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const isOwnerOrAdmin = auth.user?.role === "Owner" || auth.user?.role === "Administrator";

  const usersQuery = useQuery({
    queryKey: ["users", showInactive],
    queryFn: () => listUsers(showInactive).then((result) => result.users),
  });

  const createUserMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setInviteOpen(false);
      setInviteEmail("");
      setInviteRole("Manager");
      setOverrideReturningWarning(false);
      setReturningDetection(null);
      pushToast("User invited successfully", "success");
    },
  });

  const roleWorkflowMutation = useMutation({
    mutationFn: createIdentityWorkflow,
    onSuccess: () => {
      setRoleModalUser(null);
      setRoleReason("");
      pushToast("Role change request submitted for approval", "success");
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      pushToast("User deactivated", "info");
    },
  });

  const filteredUsers = useMemo(() => {
    const list = usersQuery.data ?? [];
    const keyword = search.trim().toLowerCase();
    if (!keyword) return list;
    return list.filter((user) => (user.email ?? "").toLowerCase().includes(keyword) || user.role.toLowerCase().includes(keyword));
  }, [usersQuery.data, search]);

  useEffect(() => {
    if (!inviteOpen) return;
    const normalizedEmail = inviteEmail.trim().toLowerCase();
    const shouldCheck = normalizedEmail.length >= 5 && inviteRole !== "Owner" && inviteRole !== "Driver" && inviteRole !== "Viewer";
    if (!shouldCheck) {
      setReturningDetection(null);
      setCheckingReturningDispatcher(false);
      setOverrideReturningWarning(false);
      return;
    }
    const timer = window.setTimeout(async () => {
      setCheckingReturningDispatcher(true);
      try {
        const result = await checkReturningDispatcher(normalizedEmail);
        setReturningDetection(result.returning_dispatcher ? result : null);
        if (!result.returning_dispatcher) setOverrideReturningWarning(false);
      } catch {
        setReturningDetection(null);
      } finally {
        setCheckingReturningDispatcher(false);
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [inviteEmail, inviteOpen, inviteRole]);

  return (
    <div className="space-y-3">
      <PageHeader title="Users" subtitle={`${filteredUsers.length} records`} />

      <div className="flex items-center justify-between gap-3">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search users"
          className="h-8 w-full max-w-sm rounded-md border border-gray-300 px-2 text-[13px]"
        />
        <div className="flex items-center gap-3">
          {isOwnerOrAdmin ? (
            <label className="inline-flex items-center gap-2 text-xs text-gray-600">
              <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
              Show inactive
            </label>
          ) : null}
          <Button onClick={() => setInviteOpen(true)}>Invite User</Button>
        </div>
      </div>

      <DataTable
        rows={filteredUsers}
        loading={usersQuery.isLoading}
        rowKey={(row) => row.id}
        onRowClick={(row) => navigate(`/users/${row.id}`)}
        columns={[
          { key: "email", label: "Email", sortable: true },
          { key: "role", label: "Role", sortable: true },
          {
            key: "status",
            label: "Status",
            render: (row) => <StatusBadge status={userStatus(row)} />,
          },
          {
            key: "last_login",
            label: "Last Login",
            render: () => "—",
          },
          {
            key: "actions",
            label: "Actions",
            className: "w-20",
            render: (row) => (
              <div className="relative">
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded border border-gray-300 hover:bg-gray-100"
                  onClick={(event) => {
                    event.stopPropagation();
                    setMenuUserId((current) => (current === row.id ? null : row.id));
                  }}
                >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
                {menuUserId === row.id ? (
                  <div className="absolute right-0 z-20 mt-1 w-36 rounded border border-gray-200 bg-white p-1 text-xs shadow">
                    <button
                      type="button"
                      className="block w-full rounded px-2 py-1 text-left hover:bg-gray-100"
                      onClick={() => {
                        if (!isOwnerOrAdmin) return;
                        setRoleModalUser(row);
                        setRoleChangeRole(row.role);
                        setMenuUserId(null);
                      }}
                    >
                      Change Role
                    </button>
                    <button
                      type="button"
                      className="block w-full rounded px-2 py-1 text-left hover:bg-gray-100"
                      onClick={async () => {
                        if (!isOwnerOrAdmin) return;
                        setMenuUserId(null);
                        const ok = window.confirm("Deactivate this user?");
                        if (!ok) return;
                        await deactivateMutation.mutateAsync(row.id);
                      }}
                    >
                      Deactivate
                    </button>
                  </div>
                ) : null}
              </div>
            ),
          },
        ]}
      />

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite User">
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (inviteRole === "Viewer") {
              pushToast("Viewer role comes in a future phase", "error");
              return;
            }
            try {
              await createUserMutation.mutateAsync({
                email: inviteEmail.trim().toLowerCase(),
                role: inviteRole,
                override_returning_warning: overrideReturningWarning,
              });
            } catch (error) {
              if (error instanceof ApiError && error.status === 409 && (error.data as { error?: string })?.error === "returning_dispatcher_detected") {
                const details = error.data as ReturningDispatcherDetectionResult & { error: string };
                setReturningDetection({
                  returning_dispatcher: true,
                  matched_events: details.matched_events ?? [],
                  severity_summary: details.severity_summary ?? { severe_count: 0, warning_count: 0, info_count: 0 },
                });
                pushToast("Returning dispatcher detected. Confirm override to continue.", "error");
                return;
              }
              if (error instanceof ApiError && error.status === 409) {
                pushToast("User with this email already exists", "error");
                return;
              }
              pushToast("Failed to invite user", "error");
            }
          }}
        >
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Email</label>
            <input
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              required
              type="email"
              className="w-full rounded border border-gray-300 px-2 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Role</label>
            <select
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value as UserRole | "Viewer")}
              className="w-full rounded border border-gray-300 px-2 py-2 text-sm"
            >
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>
          {checkingReturningDispatcher ? <div className="text-xs text-gray-500">Checking returning dispatcher history...</div> : null}
          {returningDetection ? (
            <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
              <p className="font-semibold">
                Returning dispatcher detected: {returningDetection.matched_events.length} prior safety events (
                {returningDetection.severity_summary.severe_count} severe, {returningDetection.severity_summary.warning_count} warning,{" "}
                {returningDetection.severity_summary.info_count} info)
              </p>
              <label className="mt-2 inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={overrideReturningWarning}
                  onChange={(event) => setOverrideReturningWarning(event.target.checked)}
                />
                Override warning and create user anyway
              </label>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={createUserMutation.isPending}
              disabled={Boolean(returningDetection) && !overrideReturningWarning}
            >
              Invite User
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={roleModalUser !== null} onClose={() => setRoleModalUser(null)} title="Change Role">
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!roleModalUser) return;
            try {
              await roleWorkflowMutation.mutateAsync({
                action_code: "WF-064-IDENT-002",
                target_user: roleModalUser.id,
                payload: {
                  new_role: roleChangeRole,
                  reason: roleReason.trim() || undefined,
                },
              });
            } catch {
              pushToast("Failed to submit role-change workflow", "error");
            }
          }}
        >
          <div className="text-sm text-gray-600">Current role: {roleModalUser?.role ?? "—"}</div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">New role</label>
            <select
              value={roleChangeRole}
              onChange={(event) => setRoleChangeRole(event.target.value as UserRole)}
              className="w-full rounded border border-gray-300 px-2 py-2 text-sm"
            >
              {ROLE_OPTIONS.filter((role): role is UserRole => role !== "Viewer").map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Reason (optional)</label>
            <textarea
              value={roleReason}
              onChange={(event) => setRoleReason(event.target.value)}
              rows={3}
              className="w-full rounded border border-gray-300 px-2 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setRoleModalUser(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={roleWorkflowMutation.isPending}>
              Submit Request
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
