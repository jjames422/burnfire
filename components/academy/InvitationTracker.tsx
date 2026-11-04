"use client";
import { useTranslation } from "@/components/i18n/LanguageProvider";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";

export function InvitationTracker({ token }: { token: string }) {
  const { t, locale } = useTranslation();
  const [message, setMessage] = useState("Checking invitation link…");
  const [valid, setValid] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    api<{ valid: true }>(`/api/academy/invitations/${encodeURIComponent(token)}`)
      .then((result) => {
        if (!active) return;
        setValid(!result.error);
        setMessage(result.error ?? "Invitation opened. Sign in with the invited email address to continue.");
      });
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <p
      role={valid === false ? "alert" : "status"}
      className={`mx-auto mb-4 max-w-xl border border-border bg-surface p-3 text-sm ${valid === false ? "text-warning" : "text-text-secondary"}`}
    >
      {t(message)}
    </p>
  );
}
