import { useState } from "react";

export type TeamInvite = {
  email: string;
  role: "admin" | "operator" | "driver";
};

export type TeamStepData = {
  invites?: TeamInvite[];
};

type Props = {
  value: TeamStepData;
  disabled?: boolean;
  onChange: (patch: TeamStepData) => void;
};

const ROLES: TeamInvite["role"][] = ["admin", "operator", "driver"];

export function Step5InviteTeam({ value, disabled, onChange }: Props) {
  const invites = value.invites ?? [];
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamInvite["role"]>("operator");

  function addInvite() {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes("@")) return;
    if (invites.some((i) => i.email === normalized)) return;
    onChange({ ...value, invites: [...invites, { email: normalized, role }] });
    setEmail("");
  }

  function removeInvite(target: string) {
    onChange({ ...value, invites: invites.filter((i) => i.email !== target) });
  }

  return (
    <div className="space-y-3" data-testid="onboarding-step-team">
      <h2 className="text-base font-semibold text-gray-900">Invite your team</h2>
      <p className="text-sm text-gray-600">
        Add teammates by email and assign a role. Invitations are emailed when you save this step.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="block flex-1 text-sm">
          <span className="font-medium text-gray-700">Email</span>
          <input
            type="email"
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
            value={email}
            disabled={disabled}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-gray-700">Role</span>
          <select
            className="mt-1 rounded border border-gray-300 px-2 py-1 text-sm"
            value={role}
            disabled={disabled}
            onChange={(e) => setRole(e.target.value as TeamInvite["role"])}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={disabled}
          onClick={addInvite}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-50"
        >
          Add
        </button>
      </div>

      <ul className="space-y-1">
        {invites.map((invite) => (
          <li key={invite.email} className="flex items-center justify-between rounded border border-gray-200 px-2 py-1 text-sm">
            <span>
              {invite.email} <span className="ml-2 text-xs text-gray-500">{invite.role}</span>
            </span>
            {disabled ? null : (
              <button
                type="button"
                onClick={() => removeInvite(invite.email)}
                className="text-xs text-red-600 hover:underline"
              >
                Remove
              </button>
            )}
          </li>
        ))}
        {invites.length === 0 ? <li className="text-sm text-gray-500">No invites queued yet.</li> : null}
      </ul>
    </div>
  );
}
