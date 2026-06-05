import { useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { redeemDriverInvite } from "../api/identity";
import { PwaButton } from "../components/PwaButton";

export function InviteRedeemPage() {
  const { t } = useTranslation();
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
    if (!token) return t("invite.invalid_link");
    if (!redeemMutation.isError) return "";
    const error = redeemMutation.error;
    if (error instanceof ApiError && error.status === 401) {
      return t("invite.invalid_or_expired");
    }
    return t("invite.redeem_failed");
  })();

  return (
    <div className="flex min-h-screen items-center justify-center bg-pwa-bg px-4 py-3">
      <div className="w-full max-w-sm rounded-2xl border border-pwa-border bg-pwa-card p-6">
        <h1 className="text-2xl font-semibold text-pwa-text-primary">{t("invite.title")}</h1>
        <p className="mt-2 text-sm text-pwa-text-secondary">
          {redeemMutation.isPending ? t("invite.setting_up") : t("invite.complete_access")}
        </p>
        {errorText ? <p className="mt-4 text-sm text-red-400">{errorText}</p> : null}
        {errorText ? (
          <div className="mt-4">
            <PwaButton className="w-full" variant="secondary" onClick={() => navigate("/login", { replace: true })}>
              {t("invite.go_to_login")}
            </PwaButton>
          </div>
        ) : null}
      </div>
    </div>
  );
}
