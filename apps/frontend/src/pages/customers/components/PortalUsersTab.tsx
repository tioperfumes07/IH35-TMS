import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest } from "../../../api/client";
import { Button } from "../../../components/Button";
import { DataPanel } from "../../../components/layout/DataPanel";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/Toast";

type PortalUserRow = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  active: boolean;
  archived_at: string | null;
  last_login_at: string | null;
  created_at: string;
};

type Props = {
  customerId: string;
  operatingCompanyId?: string;
};

export function PortalUsersTab({ customerId, operatingCompanyId }: Props) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const usersQuery = useQuery({
    queryKey: ["portal-users", operatingCompanyId ?? "none", customerId],
    queryFn: () =>
      apiRequest<{ portal_users: PortalUserRow[] }>(
        `/api/v1/customers/${customerId}/portal-users?operating_company_id=${encodeURIComponent(operatingCompanyId!)}`
      ).then((r: { portal_users: PortalUserRow[] }) => r.portal_users),
    enabled: Boolean(operatingCompanyId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/v1/customers/${customerId}/portal-users`, {
        method: "POST",
        body: {
          operating_company_id: operatingCompanyId,
          email: email.trim(),
          password,
          full_name: fullName.trim() || undefined,
        },
      }),
    onSuccess: async () => {
      pushToast("Portal user created", "success");
      setOpen(false);
      setEmail("");
      setPassword("");
      setFullName("");
      await queryClient.invalidateQueries({ queryKey: ["portal-users", operatingCompanyId ?? "none", customerId] });
    },
    onError: () => pushToast("Could not create portal user", "error"),
  });

  const archiveMutation = useMutation({
    mutationFn: (portalUserId: string) =>
      apiRequest(
        `/api/v1/customers/${customerId}/portal-users/${portalUserId}/archive?operating_company_id=${encodeURIComponent(operatingCompanyId!)}`,
        { method: "POST" }
      ),
    onSuccess: async () => {
      pushToast("Portal user archived", "success");
      await queryClient.invalidateQueries({ queryKey: ["portal-users", operatingCompanyId ?? "none", customerId] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Portal users</h2>
          <p className="text-sm text-gray-600">Shipper logins scoped to this customer&apos;s loads only.</p>
        </div>
        <Button onClick={() => setOpen(true)} disabled={!operatingCompanyId}>
          Create portal login
        </Button>
      </div>

      <DataPanel title="Active portal accounts">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-600">
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Last login</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {(usersQuery.data ?? []).map((row) => (
                <tr key={row.id} className="border-t border-gray-100">
                  <td className="px-3 py-2">{row.email}</td>
                  <td className="px-3 py-2">{row.full_name ?? "—"}</td>
                  <td className="px-3 py-2">{row.last_login_at ? new Date(row.last_login_at).toLocaleString() : "—"}</td>
                  <td className="px-3 py-2">{row.archived_at ? "Archived" : row.active ? "Active" : "Inactive"}</td>
                  <td className="px-3 py-2 text-right">
                    {!row.archived_at ? (
                      <Button variant="secondary" onClick={() => archiveMutation.mutate(row.id)} disabled={archiveMutation.isPending}>
                        Archive
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(usersQuery.data ?? []).length === 0 ? <p className="px-3 py-4 text-sm text-gray-600">No portal users yet.</p> : null}
        </div>
      </DataPanel>

      <Modal open={open} onClose={() => setOpen(false)} title="Create portal login">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
          <label className="block text-sm">
            Email
            <input className="mt-1 w-full rounded border border-gray-300 px-3 py-2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="block text-sm">
            Temporary password
            <input className="mt-1 w-full rounded border border-gray-300 px-3 py-2" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <label className="block text-sm">
            Full name
            <input className="mt-1 w-full rounded border border-gray-300 px-3 py-2" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
