import { useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { redeemDriverInvite } from "../api/identity";
import { PwaButton } from "../components/PwaButton";

export function InviteRedeemPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const token = useMemo(() => searchParams.get("token")?.trim() ?? "", [searchParams]);

  const redeemMutation = useMutation({
    mutationFn: redeemDriverInvite,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      navigate("/home", { replace: true });
    },
  });

  useEffect(() => {
    if (!token || redeemMutation.isPending || redeemMutation.isSuccess) return;
    void redeemMutation.mutateAsync({ token });
  }, [token, redeemMutation]);

  const errorText = (() => {
    if (!token) return "Invalid invite link.";
    if (!redeemMutation.isError) return "";
    const error = redeemMutation.error;
    if (error instanceof ApiError && error.status === 401) {
      return "This invite is invalid or expired. Please contact your dispatcher.";
    }
    return "Could not redeem invite. Please try again.";
  })();

  return (
    <div className="flex min-h-screen items-center justify-center bg-pwa-bg px-4 py-3">
      <div className="w-full max-w-sm rounded-2xl border border-pwa-border bg-pwa-card p-6">
        <h1 className="text-2xl font-semibold text-pwa-text-primary">Driver Invite</h1>
        <p className="mt-2 text-sm text-pwa-text-secondary">
          {redeemMutation.isPending ? "Setting up your account..." : "Complete your account access."}
        </p>
        {errorText ? <p className="mt-4 text-sm text-red-400">{errorText}</p> : null}
        {errorText ? (
          <div className="mt-4">
            <PwaButton className="w-full" variant="secondary" onClick={() => navigate("/login", { replace: true })}>
              Go to login
            </PwaButton>
          </div>
        ) : null}
      </div>
    </div>
  );
}
