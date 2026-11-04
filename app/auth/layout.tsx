import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return {
    title: t("Secure sign-in · BurnFire"),
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default function AuthLayout({ children }: { children: ReactNode }) {
  return children;
}
