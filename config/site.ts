import { getAlliance, type AllianceSlug } from "./alliances";

/**
 * Single point of control for which alliance is live. Routing stays
 * single-alliance (`/guides/[slug]`) for now — see docs/adding-an-alliance.md
 * for the deferred `/[alliance]/...` migration.
 */
const ACTIVE_ALLIANCE: AllianceSlug = "burnfire";

export const site = {
  activeAlliance: ACTIVE_ALLIANCE,
  alliance: getAlliance(ACTIVE_ALLIANCE),
};
