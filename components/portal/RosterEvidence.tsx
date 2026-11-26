"use client";
import { Text, useTranslation } from "@/components/i18n/LanguageProvider";

export type RosterCheck = {
  status: "match" | "mismatch" | "rank_unknown" | "not_found" | "ambiguous";
  checks: { found: boolean; name: boolean | null; rank: boolean | null };
  roster_name: string | null;
  roster_uid: string | null;
  roster_rank: string | null;
  as_of: string | null;
  fresh: boolean;
};

/** What the synced game roster says about an application: evidence for the officer, not a decision. */
export function RosterEvidence({ check }: { check: RosterCheck | null | undefined }) {
  const { t, locale } = useTranslation();
  if (!check) return null;
  const tone = check.status === "match" ? "is-match" : check.status === "rank_unknown" ? "is-partial" : "is-mismatch";
  const row = (ok: boolean | null, label: string) => (
    <li className={ok === true ? "is-ok" : ok === false ? "is-bad" : "is-unknown"}>
      <span aria-hidden="true">{ok === true ? "✓" : ok === false ? "✕" : "?"}</span>{label}
    </li>
  );
  return (
    <div className={`portal-roster-evidence ${tone}`} role="note">
      <strong>{check.status === "match" ? t("Matches the game roster") : check.status === "rank_unknown" ? t("Found in the game roster") : t("Does not match the game roster")}</strong>
      <ul>
        {row(check.checks.found, check.checks.found
          ? t("In BurnFire's roster as {name} (ID {uid})", { name: check.roster_name ?? "?", uid: check.roster_uid ?? "?" })
          : check.status === "ambiguous" ? t("Several roster members share this name") : t("Not in BurnFire's current roster"))}
        {check.checks.found && row(check.checks.name, check.checks.name === false ? t("Profile name differs from the game") : check.checks.name ? t("Profile name matches the game") : t("No profile name to compare"))}
        {check.checks.found && row(check.checks.rank, check.checks.rank === false
          ? t("Requested rank differs: the game shows {rank}", { rank: check.roster_rank?.toUpperCase() ?? "?" })
          : check.checks.rank ? t("Requested rank matches the game ({rank})", { rank: check.roster_rank?.toUpperCase() ?? "?" }) : t("The game does not report this member's rank"))}
      </ul>
      <small>
        {check.as_of && <Text values={{ time: new Date(check.as_of).toLocaleString(locale) }}>{"Roster from {time}."}</Text>}
        {" "}{!check.fresh && t("The roster is more than six hours old; confirm in game.")}
        {" "}<Text>{"A match confirms the details agree with the game, not who submitted them."}</Text>
      </small>
    </div>
  );
}
