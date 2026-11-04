import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getLocale } from "@/lib/i18n/server";
import { isLocale, type Locale } from "@/lib/i18n/locales";

export type HeroFaction = "Warrior" | "Ranger" | "Warlock";
export type HeroRole = "Tank" | "Carry" | "Support";
export type HeroTier = "S-Tier" | "Strong" | "Solid";
export type SkillKind = "Auto" | "Ultimate" | "Active" | "Passive" | "Support";

export interface HeroSkill {
  kind: SkillKind;
  name: string;
  /** Base cooldown as shown in game, e.g. "7s". Auto attacks, passives and support skills have none. */
  cooldown?: string;
  /** Hero level (and star step) the skill unlocks at, e.g. "Hero Lv 5". */
  unlock?: string;
  /** Effect across skill levels 1–40, before star upgrades. */
  effect: string;
  /** The three star-step upgrades for this skill. */
  starUpgrades?: string[];
  /** The same range once every star upgrade for this skill is unlocked. */
  maxStars?: string;
}

export type HeroRarity = "UR" | "SSR" | "SR";

export interface HeroMaxStats { attack: string; hp: string; defense: string; command: string }

export interface Hero {
  slug: string;
  name: string;
  rarity: HeroRarity;
  faction: HeroFaction;
  role: HeroRole;
  /** BF2 tier snapshot — UR heroes only. */
  tier?: HeroTier;
  /** Full artwork. Heroes without art yet show a faction placeholder. */
  image?: string;
  /** The hero's own stats at Lv150 with all 50 star steps (10★), before gear, weapon, awakening and buildings. */
  maxStats: HeroMaxStats;
  /** Power at full build (level, stars, gear, exclusive weapon, awakening, buildings and Ravens). */
  power?: string;
  /** Time between auto attacks. */
  attackInterval?: string;
  exclusiveWeapon?: string;
  /** Skill Badge order, most important first. */
  skillPriority?: string[];
  /** How the community tier lists rate this hero, e.g. "S in 6 of 7 tier lists". */
  tierLists?: string;
  /** One sentence for roster cards. */
  summary: string;
  unlock: string;
  skills: HeroSkill[];
  /** The full write-up, one string per paragraph. */
  overview: string[];
  investment: string;
  squadFit: string;
  pairsWith: string[];
}

export function getMaxStats(hero: Hero): HeroMaxStats { return hero.maxStats; }

export function getSkills(hero: Hero): HeroSkill[] { return hero.skills; }

type HeroNarrativeTranslation = {
  sourceHash?: string;
  tierLists?: string;
  summary?: string;
  unlock?: string;
  overview?: string[];
  investment?: string;
  squadFit?: string;
  skills?: Record<string, { effect?: string; starUpgrades?: string[]; maxStars?: string }>;
};

const HERO_TRANSLATIONS_ROOT = path.join(process.cwd(), "content", "burnfire", "locales");

async function resolveHeroLocale(locale?: Locale): Promise<Locale> {
  if (locale !== undefined) {
    if (!isLocale(locale)) throw new Error("Unsupported content locale");
    return locale;
  }
  return getLocale();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSkillNarrativeTranslation(value: unknown): value is NonNullable<HeroNarrativeTranslation["skills"]>[string] {
  if (!isRecord(value)) return false;
  return ["effect", "maxStars"].every(
    (key) => value[key] === undefined || typeof value[key] === "string",
  ) && (value.starUpgrades === undefined ||
    (Array.isArray(value.starUpgrades) && value.starUpgrades.every((entry) => typeof entry === "string")));
}

function isHeroNarrativeTranslation(value: unknown): value is HeroNarrativeTranslation {
  if (!isRecord(value)) return false;
  return ["sourceHash", "tierLists", "summary", "unlock", "investment", "squadFit"].every(
    (key) => value[key] === undefined || typeof value[key] === "string",
  ) && (value.overview === undefined ||
    (Array.isArray(value.overview) && value.overview.every((entry) => typeof entry === "string"))) &&
    (value.skills === undefined || (isRecord(value.skills) &&
      Object.values(value.skills).every(isSkillNarrativeTranslation)));
}

async function readHeroTranslations(locale: Locale): Promise<Record<string, HeroNarrativeTranslation>> {
  if (locale === "en") return {};
  try {
    const filePath = path.join(HERO_TRANSLATIONS_ROOT, locale, "heroes.json");
    const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
    if (!isRecord(parsed)) throw new Error("Invalid hero translation catalog");
    return Object.fromEntries(Object.entries(parsed).filter(
      (entry): entry is [string, HeroNarrativeTranslation] => {
        const source = getHero(entry[0]);
        return isHeroNarrativeTranslation(entry[1]) &&
          !!source &&
          entry[1].sourceHash === heroSourceHash(source);
      },
    ));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return {};
    throw error;
  }
}

export function heroSourceHash(hero: Hero): string {
  const narrative = [
    hero.slug,
    hero.tierLists ?? null,
    hero.summary,
    hero.unlock,
    hero.overview,
    hero.investment,
    hero.squadFit,
    hero.skills.map(({ effect, starUpgrades, maxStars }) => [
      effect, starUpgrades ?? null, maxStars ?? null,
    ]),
  ];
  return createHash("sha256").update(JSON.stringify(narrative)).digest("hex");
}

function englishOriginal(value: string, locale: Locale): string {
  return `English original (${locale} translation unavailable): ${value}`;
}

function translatedText(value: string | undefined, source: string, locale: Locale): string {
  return value?.trim() ? value : englishOriginal(source, locale);
}

function withHeroNarrative(
  hero: Hero,
  translation: HeroNarrativeTranslation | undefined,
  locale: Locale,
): Hero {
  const translatedSkills = hero.skills.map((skill, index) => {
    const localized = translation?.skills?.[String(index)];
    return {
      ...skill,
      effect: translatedText(localized?.effect, skill.effect, locale),
      starUpgrades: skill.starUpgrades?.map((upgrade, upgradeIndex) =>
        translatedText(localized?.starUpgrades?.[upgradeIndex], upgrade, locale),
      ),
      maxStars: skill.maxStars === undefined
        ? undefined
        : translatedText(localized?.maxStars, skill.maxStars, locale),
    };
  });

  return {
    ...hero,
    tierLists: hero.tierLists === undefined
      ? undefined
      : translatedText(translation?.tierLists, hero.tierLists, locale),
    summary: translatedText(translation?.summary, hero.summary, locale),
    unlock: translatedText(translation?.unlock, hero.unlock, locale),
    overview: hero.overview.map((paragraph, index) =>
      translatedText(translation?.overview?.[index], paragraph, locale),
    ),
    investment: translatedText(translation?.investment, hero.investment, locale),
    squadFit: translatedText(translation?.squadFit, hero.squadFit, locale),
    skills: translatedSkills,
  };
}

/**
 * Returns localized hero narratives from reviewed, stored content. Missing
 * fields remain explicitly labeled as English instead of being presented as
 * translated prose. `heroes` remains the canonical English dataset.
 */
export async function getLocalizedHeroes(locale?: Locale): Promise<Hero[]> {
  const resolvedLocale = await resolveHeroLocale(locale);
  if (resolvedLocale === "en") return heroes;
  const translations = await readHeroTranslations(resolvedLocale);
  return heroes.map((hero) =>
    withHeroNarrative(hero, translations[hero.slug], resolvedLocale),
  );
}

export async function getLocalizedHero(slug: string, locale?: Locale): Promise<Hero | undefined> {
  const hero = getHero(slug);
  if (!hero) return undefined;
  const resolvedLocale = await resolveHeroLocale(locale);
  if (resolvedLocale === "en") return hero;
  const translations = await readHeroTranslations(resolvedLocale);
  return withHeroNarrative(hero, translations[hero.slug], resolvedLocale);
}

export const rarityOrder: HeroRarity[] = ["UR", "SSR", "SR"];

export const heroDataSource = { name: "Last Asylum Wiki", url: "https://last-asylum-wiki.vercel.app/heroes/", checked: "2026-11-03" };

export const heroes: Hero[] = [
  {
    slug: "arthur",
    name: "Arthur",
    rarity: "UR",
    faction: "Warrior",
    role: "Tank",
    tier: "S-Tier",
    image: "/images/heroes/arthur.webp",
    maxStats: { attack: "13,096", hp: "2,996,645", defense: "16,770", command: "350" },
    power: "1,052,453",
    attackInterval: "0.9s",
    exclusiveWeapon: "Stone Shield",
    skillPriority: ["Earthshattering", "Strong Will", "Rock Solid", "Battle Shield"],
    tierLists: "S in 6 of 7 tier lists",
    summary: "The starter tank everyone gets first, and still one of the best frontline anchors in the game.",
    unlock: "Available from day one, with no server-day requirement. 10 Arthur Shards unlock him; they drop from Tavern recruitment, the Alliance Shop and event rewards, and every 50th recruit pull guarantees 10 shards of one UR hero.",
    skills: [
      { kind: "Auto", name: "Battle Shield", effect: "Swings the shield, dealing 105% to 300% ATK Physical DMG to a single enemy.", starUpgrades: ["Star 5: Deals 40% extra damage", "Star 25: Extra damage increases to 100%", "Star 50: Extra damage increases to 200%"], maxStars: "At star 50: 315% to 900%" },
      { kind: "Ultimate", name: "Earthshattering", cooldown: "7s", unlock: "Hero Lv 5", effect: "Slams the ground with a shield, dealing 591.15% to 1,689% ATK Physical DMG to enemies within range, reducing Physical DMG taken by allies within range by 10.25% to 20% for 5s.", starUpgrades: ["Star 10: Physical DMG reduction increases by 3%", "Star 30: Physical DMG reduction increases by 4.5%", "Star 50: Physical DMG reduction increases by 7.5%"], maxStars: "At star 50: 591.15% / 25.25% to 1,689% / 35%" },
      { kind: "Active", name: "Rock Solid", cooldown: "5s", unlock: "Hero Lv 10", effect: "Grants a shield equal to 5.25% to 15% of current max HP, absorbing 50% of damage taken each time, lasting for 3s.", starUpgrades: ["Star 15: Shield effect increases by 20%", "Star 35: Shield effect increases by 30%", "Star 45: Shield effect increases by 50%"], maxStars: "At star 45: 10.5% to 30%" },
      { kind: "Passive", name: "Strong Will", unlock: "Hero Lv 20", effect: "In combat, reduces all damage received by allied tank heroes by 3.08% to 6%.", starUpgrades: ["Star 20: Effect increases by 0.6%", "Star 45: Effect increases by 0.9%", "Star 50: Effect increases by 1.5%"], maxStars: "At star 50: 6.08% to 9%" },
      { kind: "Support", name: "Tenacity", unlock: "Hero Lv 30 · star 40", effect: "ATK, HP, and DEF +20%; skill cooldown speed +10%." },
    ],
    overview: [
      "Arthur is the hero you build before any other hero exists. He shows up on day one, he's free, and he doesn't fall off. His job is simple: stand in front, take the hits, and make everyone behind him harder to kill.",
      "Earthshattering is what makes him special. It's a big AoE hit, but the real value is the damage-reduction aura it drops on the whole squad. Rock Solid keeps him alive between ultimates, and Strong Will quietly makes every other tank in the lineup tougher too, so he plays well next to a second tank rather than competing with one.",
      "He's equally at home in PvE grinding (Rat Swarm waves, Rat King, territory reclamation) and in PvP, which is why nearly every guide puts him at the top of the tank list.",
    ],
    investment: "Get him to 8★ (star step 40) — that's where Tenacity unlocks, his biggest single stat jump. Most guides suggest having him at 5–6★ before you start pouring shards into Marlena. Skill Badges go to Earthshattering first.",
    squadFit: "Arthur and Marlena are the core duo every new account should build around. As a Warrior he also feeds Harper's Warrior's Anthem, and his Physical damage reduction covers a different damage type than Shadow's Energy reduction if you run them together.",
    pairsWith: ["marlena", "harper", "daskal", "shadow"],
  },
  {
    slug: "shadow",
    name: "Shadow",
    rarity: "UR",
    faction: "Ranger",
    role: "Tank",
    tier: "S-Tier",
    image: "/images/heroes/shadow.webp",
    maxStats: { attack: "12,457", hp: "3,197,912", defense: "16,929", command: "350" },
    power: "1,075,906",
    attackInterval: "0.83s",
    exclusiveWeapon: "Phantom Dagger",
    tierLists: "S in 2 of 3 tier lists",
    summary: "A tank who shreds enemy DEF and cuts their Energy damage while still dealing real damage of his own.",
    unlock: "Joins the Tavern once the server is 6 days old, and 10 Shadow Shards unlock him. Several rankings treat him as a premium hero: his shards come mainly from top-up rewards and paid packs, and standard summons rarely give him.",
    skills: [
      { kind: "Auto", name: "Smoke Cartridge", effect: "Randomly throws 3 smoke bombs, each dealing 29.4% to 84% ATK Physical DMG to a single enemy.", starUpgrades: ["Star 5: Deals 40% extra damage", "Star 25: Extra damage increases to 100%", "Star 50: Extra damage increases to 200%"], maxStars: "At star 50: 88.2% to 252%" },
      { kind: "Ultimate", name: "Shadow Hunt", cooldown: "7s", unlock: "Hero Lv 5", effect: "Unleashes a rolling black mist, dealing 387.45% to 1,107% ATK Physical DMG to all enemies and reducing their Energy DMG by 5.2% to 13% for 5s.", starUpgrades: ["Star 10: Effect increases by 3%", "Star 30: Effect increases by 3%", "Star 50: Effect increases by 3%"], maxStars: "At star 50: 387.45% / 14.2% to 1,107% / 22%" },
      { kind: "Active", name: "Shadow Strike", cooldown: "5s", unlock: "Hero Lv 10", effect: "Throws a large smoke cartridge, dealing 194.25% to 555% ATK Physical DMG to enemies in range and reducing their DEF by 15.38% to 30% for 3s.", starUpgrades: ["Star 15: Effect increases by 4.5%", "Star 35: Effect increases by 7.5%", "Star 45: Effect increases by 12%"], maxStars: "At star 45: 194.25% / 39.38% to 555% / 54%" },
      { kind: "Passive", name: "Shadow Veil", unlock: "Hero Lv 20", effect: "In combat, reduces Energy DMG taken by 8.3% to 20%.", starUpgrades: ["Star 20: Effect increases by 5%", "Star 45: Effect increases by 5%", "Star 50: Effect increases by 5%"], maxStars: "At star 50: 23.3% to 35%" },
      { kind: "Support", name: "Tenacity", unlock: "Hero Lv 30 · star 40", effect: "ATK, HP, and DEF +20%; skill cooldown speed +10%." },
    ],
    overview: [
      "Shadow doesn't tank like Arthur does. Instead of shielding the squad, he makes the enemy weaker. Shadow Strike cuts enemy DEF by up to 30% for 3 seconds (54% with full stars), which turns every carry behind him into a bigger threat, and Shadow Hunt drags the whole enemy line's Energy damage down by up to 13% (22% with full stars).",
      "That Energy reduction matters because most of the game's top carries — Marlena, Cynthia, Red Lady, Annie — deal Energy damage. Add his own passive Energy resistance (up to 20%, or 35% with full stars) and he's very hard for those carries to burn through.",
      "He also hits harder than a tank has any right to. His smoke bombs and both AoE skills mean he's contributing damage the entire fight, not just soaking it.",
    ],
    investment: "When you're spending UR Omni shards, the usual order is Marlena first, then Harper, then Cynthia, then Shadow. 8★ unlocks Tenacity, and Shadow Strike's DEF shred gets its biggest upgrade at star 45.",
    squadFit: "He's the frontline pick in BF2's full-roster squad (Shadow + Daskal + Harper + Marlena + Cynthia). That lineup gives up the full faction bonus, but his DEF shred is worth the trade. Bell also gets value from him in an all-Ranger squad.",
    pairsWith: ["daskal", "marlena", "cynthia", "harper", "bell"],
  },
  {
    slug: "daskal",
    name: "Daskal",
    rarity: "UR",
    faction: "Warrior",
    role: "Tank",
    tier: "Strong",
    image: "/images/heroes/daskal.webp",
    maxStats: { attack: "12,937", hp: "3,041,371", defense: "16,770", command: "350" },
    power: "1,057,192",
    attackInterval: "0.83s",
    exclusiveWeapon: "Crimson Greatsword",
    skillPriority: ["Bloodshed Defense", "Deadly Pierce", "Resolute Fight", "Battle Will"],
    summary: "A self-healing tank who shields the entire squad and steps in when your damage dealer gets low.",
    unlock: "Arrives once the server is 27 days old, and 10 Daskal Shards unlock him. Shards come from recruit pulls, and every 50th pull guarantees 10 UR shards.",
    skills: [
      { kind: "Auto", name: "Battle Will", effect: "Slashes the target, dealing 87.15% to 249% ATK Physical DMG to a single enemy.", starUpgrades: ["Star 5: Deals 40% extra damage", "Star 25: Extra damage increases to 100%", "Star 50: Extra damage increases to 200%.Exclusive weapon star 20: Extra damage increases to 300%"], maxStars: "At star 50: 261.45% to 747%" },
      { kind: "Ultimate", name: "Bloodshed Defense", cooldown: "6.4s", unlock: "Hero Lv 5", effect: "Concentrates energy to grant every ally a shield equal to 126% to 360% of their max DEF, absorbing 50% of incoming damage for 5s.", starUpgrades: ["Star 10: Shield effect increases by 30%", "Star 30: Shield effect increases by 30%", "Star 50: Shield effect increases by 30%.Exclusive weapon star 50: Shield effect increases by 30%"], maxStars: "At star 50: 239.4% to 684%" },
      { kind: "Active", name: "Deadly Pierce", cooldown: "5s", unlock: "Hero Lv 10", effect: "Stabs the target with a two-handed sword, dealing 323.4% to 924% ATK Physical DMG and restoring HP equal to 42% to 120% ATK.", starUpgrades: ["Star 15: Restores 60% extra HP", "Star 35: Extra HP recovery increases to 150%", "Star 45: Extra HP recovery increases to 300%.Exclusive weapon star 40: Extra HP recovery increases to 400%"], maxStars: "At star 45: 323.4% / 168% to 924% / 480%" },
      { kind: "Passive", name: "Resolute Fight", unlock: "Hero Lv 20", effect: "When your DPS hero's HP drops below 50%, gains a shield equal to 5.25% to 15% of max HP, absorbing 50% damage for 5s", starUpgrades: ["Star 20: Shield Duration +2s", "Star 45: Shield effect increases by 20%", "Star 50: Shield effect increases by 30%.Exclusive weapon star 30: Support Hero also gets a Shield when HP is below 50%"], maxStars: "At star 50: 7.88% to 22.5%" },
      { kind: "Support", name: "Tenacity", unlock: "Hero Lv 30 · star 40", effect: "ATK, HP, and DEF +20%; skill cooldown speed +10%." },
    ],
    overview: [
      "Daskal is all about survival. He heals himself with Deadly Pierce, puts a shield on every ally with Bloodshed Defense — at 6.4 seconds, the shortest ultimate cooldown of any tank — and Resolute Fight drops an emergency shield when your damage dealer falls below 50% HP.",
      "That makes him at his best in PvP and longer battles, where the opening burst is what kills squads. His raw stat contribution is less impressive in PvE, so he's more of a war tank than a farming one.",
    ],
    investment: "Light spenders should take him to 8★ — that's where Tenacity unlocks and it's his biggest jump. Whales can push to 10★ for bigger shields and healing, but it isn't essential unless you're heavily invested in PvP.",
    squadFit: "His shields are what buy time in BF2's full-roster squad, sitting next to Shadow in front of Harper, Marlena and Cynthia. Next to Arthur he makes a dense Warrior front row: Arthur cuts the Physical damage allies take, and Daskal's shield works against any damage type.",
    pairsWith: ["shadow", "arthur", "harper", "marlena"],
  },
  {
    slug: "billy",
    name: "Billy",
    rarity: "UR",
    faction: "Warlock",
    role: "Tank",
    tier: "Solid",
    image: "/images/heroes/billy.webp",
    maxStats: { attack: "15,492", hp: "2,348,117", defense: "16,131", command: "350" },
    power: "980,246",
    skillPriority: ["Fate's Thread", "Truth and Lies", "Puppet", "Wooden Frame"],
    summary: "A puppet-master tank who protects your carries from stuns and Energy burst instead of just soaking damage.",
    unlock: "Unlocks once the server is 83 days old, with 10 Billy Shards. Only Nicole arrives later among the UR heroes, so most accounts reach Billy with a tank core already built.",
    skills: [
      { kind: "Auto", name: "Wooden Frame", effect: "Swings the marionette, dealing 87.15% to 249% ATK Physical DMG to a single enemy.", starUpgrades: ["Star 5: Deals 40% extra damage", "Star 25: Extra damage increases to 100%", "Star 50: Extra damage increases to 200%"], maxStars: "At star 50: 261.45% to 747%" },
      { kind: "Ultimate", name: "Truth and Lies", cooldown: "7s", unlock: "Hero Lv 5", effect: "Lifts the marionette stand and smashes it to the ground, dealing 510.3% to 1,458% ATK damage to enemies within range, granting the 3 highest-ATK allies a 70% chance to be immune to stun.", starUpgrades: ["Star 10: All damage received by allied defense heroes reduces by 15% for 5s", "Star 30: Chance of stun immunity +30%", "Star 50: Deals 100% extra damage and increases 3 random enemy Heroes' damage taken by 15% for 5s"], maxStars: "At star 50: 1,020.6% to 2,916%" },
      { kind: "Active", name: "Fate's Thread", cooldown: "5s", unlock: "Hero Lv 10", effect: "Swings the marionette, dealing 216.3% to 618% ATK Physical DMG to a single target, reducing Energy DMG received by the 2 highest-ATK allies by 12.3% to 24% for 4s.", starUpgrades: ["Star 15: Damage reduction increases by 6%", "Star 35: Allied target +1", "Star 45: Damage reduction increases by 6%"], maxStars: "At star 45: 216.3% / 24.3% to 618% / 36%" },
      { kind: "Passive", name: "Puppet", unlock: "Hero Lv 20", effect: "In combat, reduces all damage taken by 8.2% to 16%.", starUpgrades: ["Star 20: Effect increases by 3%", "Star 45: Effect increases by 5%", "Star 50: Reduces Energy DMG taken by an extra 8%"], maxStars: "At star 50: 16.2% to 24%" },
      { kind: "Support", name: "Tenacity", unlock: "Hero Lv 30 · star 40", effect: "ATK, HP, and DEF +20%; skill cooldown speed +10%." },
    ],
    overview: [
      "Billy is a defensive tank with a utility twist. He's tough on his own thanks to Puppet, but where he earns his slot is in how he protects your damage dealers — his ultimate gives your three highest-ATK heroes a 70% chance to shrug off stuns, and Fate's Thread cuts the Energy damage your two highest-ATK heroes take by up to 24% (36% with full stars).",
      "That makes him a direct answer to crowd-control-heavy enemies. Red Lady's ultimate is built around stunning your two hardest hitters, and Billy is one of the few heroes who can switch that off. He's valuable in both PvP and sustained fights.",
    ],
    investment: "8★ is the recommendation for everyone — it's a big survivability spike. Whales can go to 10★ for full optimization, but it isn't required.",
    squadFit: "Best in squads where your carries are the target. He fits a Warlock-heavy lineup with Annie, Joker and Nicole, and he's a strong counter-pick into enemies running Red Lady.",
    pairsWith: ["annie", "joker", "nicole", "ulfrid"],
  },
  {
    slug: "ulfrid",
    name: "Ulfrid",
    rarity: "UR",
    faction: "Warlock",
    role: "Tank",
    tier: "Solid",
    image: "/images/heroes/ulfrid.webp",
    maxStats: { attack: "13,575", hp: "2,840,103", defense: "16,610", command: "350" },
    power: "1,033,739",
    attackInterval: "0.83s",
    skillPriority: ["Throat Bite", "Wolf Bloodline", "Lunar Howl", "Sharp Claw"],
    summary: "A wolf-blooded tank who punishes anyone who hits him by reflecting their damage straight back.",
    unlock: "Available once the server is 41 days old, and 10 Ulfrid Shards unlock him. Shards come from recruitment and events.",
    skills: [
      { kind: "Auto", name: "Sharp Claw", effect: "Swings sharp claws, dealing 87.15% to 249% ATK Physical DMG to a single enemy.", starUpgrades: ["Star 5: Deals 40% extra damage", "Star 25: Extra damage increases to 100%", "Star 50: Extra damage increases to 200%.Exclusive weapon star 20: Extra damage increases to 300%"], maxStars: "At star 50: 261.45% to 747%" },
      { kind: "Ultimate", name: "Throat Bite", cooldown: "7s", unlock: "Hero Lv 5", effect: "Charges up, then lunges forward and bites the target, dealing 632.1% to 1,806% ATK Physical DMG, and reducing all damage taken by all allied heroes by 5.13% to 10% for 4s.", starUpgrades: ["Star 10: Effect increases by 2%", "Star 30: Effect increases by 3%", "Star 50: Effect increases by 5%.Exclusive weapon star 50: Effect increases by 7%"], maxStars: "At star 50: 632.1% / 15.13% to 1,806% / 20%" },
      { kind: "Active", name: "Lunar Howl", cooldown: "5s", unlock: "Hero Lv 10", effect: "Howls to the sky, entering Berserk state: when taking damage, reflects 61.5% to 120% of that damage back to the attacker. This effect lasts for 3s.", starUpgrades: ["Star 15: Effect increases by 12%", "Star 35: Effect Duration +1s", "Star 45: Effect increases by 30%Exclusive weapon star 40: While in Berserk state, DEF increases by 10%"], maxStars: "At star 45: 103.5% to 162%" },
      { kind: "Passive", name: "Wolf Bloodline", unlock: "Hero Lv 20", effect: "In combat, reduces all damage taken by 8.2% to 16%.", starUpgrades: ["Star 20: Effect increases by 1.6%", "Star 45: Effect increases by 2.4%", "Star 50: Effect increases by 4%.Exclusive weapon star 30: Effect increases by 5%"], maxStars: "At star 50: 16.2% to 24%" },
      { kind: "Support", name: "Tenacity", unlock: "Hero Lv 30 · star 40", effect: "ATK, HP, and DEF +20%; skill cooldown speed +10%." },
    ],
    overview: [
      "Ulfrid is a counter-puncher. Instead of relying on his own damage, he makes the enemy pay for focusing him — during Lunar Howl, he reflects up to 120% of every hit he takes back at the attacker for 3 seconds (162% with full stars). Combine that with Wolf Bloodline's damage reduction and his ultimate's team-wide damage reduction, and he's genuinely annoying to kill.",
      "The catch is timing. His big value lives inside a 3-second window, so his impact is more situational and easier to play around than the top-tier tanks. That's why he sits a step below Arthur and Shadow rather than alongside them.",
    ],
    investment: "Light spenders can stop at 8★. Whales should push him to 10★.",
    squadFit: "He works best in sustained fights where the enemy is forced to attack through him. In a Warlock squad he stacks with Billy for a very durable front line, and Nicole's passive (+8% ATK for every Warlock) helps him too.",
    pairsWith: ["billy", "nicole", "annie"],
  },
  {
    slug: "louis",
    name: "Louis",
    rarity: "UR",
    faction: "Ranger",
    role: "Tank",
    tier: "Solid",
    image: "/images/heroes/louis.webp",
    maxStats: { attack: "13,256", hp: "2,929,555", defense: "16,770", command: "350" },
    power: "1,044,341",
    attackInterval: "0.83s",
    skillPriority: ["Cross Whip", "Indomitable Spirit", "Force Link", "Shackles"],
    summary: "A chain-whip tank built on damage reduction, self-healing, and refusing to die at the worst moment.",
    unlock: "Appears once the server is 62 days old, and 10 Louis Shards unlock him. He's the fifth of the six UR tanks to arrive.",
    skills: [
      { kind: "Auto", name: "Shackles", effect: "Swings the iron chain, dealing 87.15% to 249% ATK Physical DMG to a single target.", starUpgrades: ["Star 5: Deals 40% extra damage", "Star 25: Extra damage increases to 100%", "Star 50: Extra damage increases to 200%.Exclusive weapon star 20: Extra damage increases to 300%"], maxStars: "At star 50: 261.45% to 747%" },
      { kind: "Ultimate", name: "Cross Whip", cooldown: "7s", unlock: "Hero Lv 5", effect: "Simultaneously swings 2 chains forward, dealing 299.25% to 855% ATK damage to enemies within range, healing self for 150% ATK, and reducing all damage taken by 15.38% to 30% for 5s.", starUpgrades: ["Star 10: Damage reduction additionally applies to 1 nearest ally", "Star 30: Damage reduction applies to all allies", "Star 50: Deals 60% extra damage.Exclusive weapon star 50: Damage reduction increases by 5%"], maxStars: "At star 50: 478.8% / 15.38% to 1,368% / 30%" },
      { kind: "Active", name: "Force Link", cooldown: "5s", unlock: "Hero Lv 10", effect: "Charges both hands, creating an energy field that reduces Energy DMG taken by the 2 allies with the highest DEF within range by 9.23% to 18% for 4s", starUpgrades: ["Star 15: Effect increases by 8%", "Star 35: Effect increases by 12%", "Star 45: Target +1Exclusive weapon star 40: Target +1"], maxStars: "At star 45: 21.23% to 30%" },
      { kind: "Passive", name: "Indomitable Spirit", unlock: "Hero Lv 20", effect: "In combat, reduces all damage taken by 15.38% to 30% and triggers an undying state upon taking fatal damage, retaining 1 HP for 2s. The state can only be triggered once.", starUpgrades: ["Star 20: Duration +1s", "Star 45: Duration +1s", "Star 50: Duration +1sExclusive weapon star 30: Duration +1s"], maxStars: "At star 50: 15.38% to 30%" },
      { kind: "Support", name: "Tenacity", unlock: "Hero Lv 30 · star 40", effect: "ATK, HP, and DEF +20%; skill cooldown speed +10%." },
    ],
    overview: [
      "Louis is the frontline anchor whose whole kit is about buying time for the backline. Cross Whip hits, heals him, and hands the entire squad a big damage-reduction window. Force Link protects your other tanky heroes from Energy damage, and Indomitable Spirit gives him one free save from a killing blow every fight.",
      "He's very star-dependent. At low stars he's less reliable and can be outperformed by tanks like Shadow, but his effectiveness climbs a lot as you invest.",
    ],
    investment: "Light spenders can stop at 7★, though 8★ is recommended. Whales should aim for 9–10★ to see his full potential.",
    squadFit: "As a Ranger he fits an all-Ranger squad with Shadow, Cynthia, Red Lady and Bell. Force Link targets your highest-DEF allies, so he's at his best next to another tank.",
    pairsWith: ["shadow", "bell", "cynthia", "red-lady"],
  },
  {
    slug: "marlena",
    name: "Marlena",
    rarity: "UR",
    faction: "Warrior",
    role: "Carry",
    tier: "S-Tier",
    image: "/images/heroes/marlena.webp",
    maxStats: { attack: "23,797", hp: "1,297,055", defense: "14,534", command: "350" },
    power: "914,868",
    attackInterval: "0.87s",
    skillPriority: ["Peerless Blade", "Crimson Bloom", "War God's Will", "Skybreaker Slash"],
    tierLists: "S in 5 of 6 tier lists",
    summary: "The core UR damage dealer for every account — available from day one and the first place most guides put UR Omni shards.",
    unlock: "Available from day one, with no server-day requirement. Her shards drop from Tavern recruitment, banner free pulls and event rewards, and the First Top Up pack (about US$1) includes her.",
    skills: [
      { kind: "Auto", name: "Skybreaker Slash", effect: "Unleash a sword wind, dealing 91.35% to 261% ATK as Energy DMG to a single target.", starUpgrades: ["Star 5: Deals 40% extra damage", "Star 25: Extra damage increases to 100%", "Star 50: Extra damage increases to 200%.Awakening level 1: Releases 1 sword wind targeting a single enemy, dealing 783% ATK Energy DMG. on Crit, Marlena gains 1 stack of Battle Will, capped at 2x the number of Warriors in your team. Each stack grants 1% DMG up and 1% DMG down"], maxStars: "At star 50: 274.05% to 783%" },
      { kind: "Ultimate", name: "Peerless Blade", cooldown: "15s", unlock: "Hero Lv 5", effect: "Releases 3 sword winds, each randomly targeting an enemy, dealing 357% to 1,020% ATK Energy DMG.", starUpgrades: ["Star 10: Sword Wind +1; each deals 20% extra damage", "Star 30: Each deals 100% extra damage", "Star 50: Sword Wind +1; each deals 140% extra damageAwakening level 40: Releases 3 sword winds, each randomly targeting an enemy, dealing 3,382.5% ATK Energy DMG. Additionally releases 5 more sword winds with 60% of original damage"], maxStars: "At star 50: 1,183.88% to 3,382.5%" },
      { kind: "Active", name: "Crimson Bloom", cooldown: "5s", unlock: "Hero Lv 10", effect: "Throws a scarlet flower that explodes on impact, dealing 204.75% to 585% ATK Energy DMG to targets within range.", starUpgrades: ["Star 15: Deals 20% extra damage and increases ATK by 12% for 3s", "Star 35: Extra damage increases to 70%", "Star 45: Extra damage increases to 150%.Awakening level 10: Hurls 1 Crimson Blossom that explodes on impact, dealing 1,462.5% ATK Energy DMG to all enemies. If Marlena's Battle Will exceeds 5 stacks, inflicts Dread on all enemies, reducing their DMG by 5%"], maxStars: "At star 45: 511.88% to 1,462.5%" },
      { kind: "Passive", name: "War God's Will", unlock: "Hero Lv 20", effect: "In combat, increases Energy DMG dealt by 8.2% to 16%.", starUpgrades: ["Star 20: Effect increases by 1.6%", "Star 45: Effect increases by 2.4%", "Star 50: Effect increases by 4%.Awakening level 20: In battle, Energy DMG dealt +24%. At battle start, Marlena attacks the 3 enemies with highest HP, dealing 2500% ATK Energy DMG. on hit, Marlena gains 3 stacks of Battle Will"], maxStars: "At star 50: 16.2% to 24%" },
      { kind: "Support", name: "Tenacity", unlock: "Hero Lv 30 · star 40", effect: "ATK, HP, and DEF +20%; skill cooldown speed +10%." },
    ],
    overview: [
      "Marlena is the damage dealer most guides build first, and the reason is how her kit stacks. Peerless Blade throws three sword winds at random enemies for up to 1,020% ATK Energy damage each (3,382.5% with full stars), Crimson Bloom adds an area hit every 5 seconds, and War God's Will raises all of her Energy damage by up to 16% (24% with full stars). Tenacity adds +20% ATK, HP and DEF on top.",
      "She's also available from day one, which is why almost every guide agrees she should be the first place your UR Omni shards go.",
    ],
    investment: "She's the first priority for UR Omni shards, ahead of Harper, Cynthia and Shadow. Start pushing her once Arthur is around 5–6★, and treat 8★ (Tenacity) as the first real milestone.",
    squadFit: "Arthur and Marlena are the core duo for every new account. She's also a Warrior, so Harper's Warrior's Anthem buffs her directly, and she's the main damage in BF2's full-roster squad alongside Cynthia.",
    pairsWith: ["arthur", "harper", "cynthia", "daskal"],
  },
  {
    slug: "zoya",
    name: "Zoya",
    rarity: "UR",
    faction: "Warrior",
    role: "Carry",
    tier: "Strong",
    image: "/images/heroes/zoya.webp",
    maxStats: { attack: "25,074", hp: "1,229,966", defense: "14,214", command: "350" },
    power: "918,563",
    attackInterval: "0.83s",
    exclusiveWeapon: "Forest Blade",
    skillPriority: ["Forest Hunter", "Mountain God Wrath", "Lady of the Forest", "Dagger"],
    summary: "Marlena's crit-based cousin — huge dagger hits that scale differently into the late game.",
    unlock: "Joins once the server is 55 days old, and 10 Zoya Shards unlock her. She's the last of the UR Warriors to appear.",
    skills: [
      { kind: "Auto", name: "Dagger", effect: "Throws a forest dagger at the target, dealing 87.15% to 249% ATK Energy DMG to a single enemy.", starUpgrades: ["Star 5: Deals 40% extra damage", "Star 25: Extra damage increases to 100%", "Star 50: Extra damage increases to 200%"], maxStars: "At star 50: 261.45% to 747%" },
      { kind: "Ultimate", name: "Forest Hunter", cooldown: "15s", unlock: "Hero Lv 5", effect: "Quickly tosses 3 special daggers, randomly targeting 3 enemies, dealing 583.8% to 1,668% ATK DMG to each.", starUpgrades: ["Star 10: Blade +1", "Star 30: Deals 60% extra damage", "Star 50: Extra damage increases to 120%; +1 blade"], maxStars: "At star 50: 1,284.36% to 3,669.6%" },
      { kind: "Active", name: "Mountain God Wrath", cooldown: "5s", unlock: "Hero Lv 10", effect: "Clasps hands tightly to summon a whirlwind of green leaves that deals 73.5% to 210% ATK Energy DMG per second to enemies within range over 3s. During this time, enemies within the whirlwind take 20% extra Energy DMG.", starUpgrades: ["Star 15: Deals 60% extra damage", "Star 35: Extra damage increases to 130%", "Star 45: Extra damage increases to 200%"], maxStars: "At star 45: 220.5% to 630%" },
      { kind: "Passive", name: "Lady of the Forest", unlock: "Hero Lv 20", effect: "In combat, increases 8.2% to 16% Crit Rate.", starUpgrades: ["Star 20: Effect increases by 1.6%", "Star 45: Effect increases by 2.4%", "Star 50: Effect increases by 4%"], maxStars: "At star 50: 16.2% to 24%" },
      { kind: "Support", name: "Tenacity", unlock: "Hero Lv 30 · star 40", effect: "ATK, HP, and DEF +20%; skill cooldown speed +10%." },
    ],
    overview: [
      "Zoya's kit is built very much like Marlena's, but where Marlena's passive boosts Energy damage, Zoya's boosts Crit Rate. That means she scales differently as the game goes on and gear and buffs start stacking.",
      "Mountain God Wrath does double duty: it's steady damage over three seconds, and it makes everything it touches take more Energy damage from the rest of your squad. Forest Hunter's three daggers each hit for up to 1,668% ATK, or 3,669.6% with full stars.",
    ],
    investment: "She's star-dependent and performs much better at higher stars. Light spenders should get her to 8★ and save the rest of their UR Omni shards for upcoming heroes. Whales can push her to 10★.",
    squadFit: "A Warrior carry, so she slots in beside Marlena with Harper's buff covering both. Her Energy-damage amplifier makes every other Energy carry on the team hit harder.",
    pairsWith: ["marlena", "harper", "arthur"],
  },
  {
    slug: "cynthia",
    name: "Cynthia",
    rarity: "UR",
    faction: "Ranger",
    role: "Carry",
    tier: "Strong",
    image: "/images/heroes/cynthia.webp",
    maxStats: { attack: "22,200", hp: "1,431,233", defense: "14,693", command: "350" },
    power: "916,153",
    attackInterval: "0.83s",
    skillPriority: ["Moonfall Dance", "Lunar Hunt", "Moon's Blessing", "Moon Blade"],
    summary: "A moon-blade Energy carry with heavy single-target hits and a Crit buff that grows with every star.",
    unlock: "Can unlock once the server is 6 days old, with 10 Cynthia Shards. Several rankings treat her as a premium hero: her shards come mostly from paid packs, so standard pulls rarely give her. Every 50th recruit pull still guarantees 10 UR shards.",
    skills: [
      { kind: "Auto", name: "Moon Blade", effect: "Uses a moon blade to deal 87.15% to 249% ATK Energy DMG to a single enemy.", starUpgrades: ["Star 5: Deals 40% extra damage", "Star 25: Extra damage increases to 100%", "Star 50: Extra damage increases to 200%.Awakening level 1: Unleash Moon Blade on a single enemy, dealing 747% ATK Energy DMG and gaining 1 stack of Moonlight. Max stacks equal 4x the number of Rangers in your team. Each stack grants Cynthia 1% Energy DMG Bonus"], maxStars: "At star 50: 261.45% to 747%" },
      { kind: "Ultimate", name: "Moonfall Dance", cooldown: "15s", unlock: "Hero Lv 5", effect: "Increases Crit Rate by 8.2% to 16%. Fires a giant moon blade, dealing 520.8% to 1,488% ATK Energy DMG to enemies in range.", starUpgrades: ["Star 10: Deals 40% extra damage", "Star 30: Deals damage to all enemies", "Star 50: Extra damage increases to 100%.Awakening level 20: Increases Crit Rate by 16%. Releases 1 giant Moon Blade to deal 2,976% ATK Energy DMG to enemies within range, costing up to 10 stacks of Moonlight. Deals additional Energy DMG of 60% ATK * consumed Moonlight stacks to enemies"], maxStars: "At star 50: 8.2% / 1,041.6% to 16% / 2,976%" },
      { kind: "Active", name: "Lunar Hunt", cooldown: "5s", unlock: "Hero Lv 10", effect: "Randomly locks onto 3 targets, launching 3 moon blades, each dealing 210% to 600% ATK Energy DMG.", starUpgrades: ["Star 15: Deals 40% extra damage", "Star 35: Extra damage increases to 100%", "Star 45: Extra damage increases to 200%.Awakening level 10: Randomly locks onto 3 targets, launching 3 moon blades, each dealing 1,800% ATK Energy DMG. Deals an additional 20% damage and grants 2 stacks of Moonlight"], maxStars: "At star 45: 630% to 1,800%" },
      { kind: "Passive", name: "Moon's Blessing", unlock: "Hero Lv 20", effect: "In combat, increases 8.2% to 16% Crit Rate.", starUpgrades: ["Star 20: Effect increases by 1.6%", "Star 45: Effect increases by 2.4%", "Star 50: Effect increases by 4%.Awakening level 40: In combat, increases 24% Crit Rate. Crit hits deal an additional 20% damage"], maxStars: "At star 50: 16.2% to 24%" },
      { kind: "Support", name: "Tenacity", unlock: "Hero Lv 30 · star 40", effect: "ATK, HP, and DEF +20%; skill cooldown speed +10%." },
    ],
    overview: [
      "Cynthia is a strong Energy damage dealer who also buffs her own crits. Lunar Hunt is the workhorse — three locked-on blades at up to 600% ATK each (1,800% with full stars), every 5 seconds — and Moonfall Dance lets her hit multiple enemies while stacking more Crit Rate on top of her passive.",
      "She scales very well with stars. At the same investment, Marlena usually outperforms her, but Cynthia is the natural second carry once your main squad is set.",
    ],
    investment: "She's worth UR Omni shards, but free-to-play and light spenders should finish Marlena first. 8★ is strong and stable for light spenders; whales can take her to 10★ for full burst.",
    squadFit: "She's the second carry in BF2's full-roster squad with Marlena. As a Ranger she also fits an all-Ranger squad with Shadow, Louis, Red Lady and Bell, where Bell's Battle Anthem buffs her.",
    pairsWith: ["marlena", "shadow", "bell", "harper"],
  },
  {
    slug: "red-lady",
    name: "Red Lady",
    rarity: "UR",
    faction: "Ranger",
    role: "Carry",
    tier: "Solid",
    image: "/images/heroes/red-lady.webp",
    maxStats: { attack: "23,158", hp: "1,341,781", defense: "14,534", command: "350" },
    power: "913,583",
    attackInterval: "0.83s",
    exclusiveWeapon: "Crimson Edge",
    skillPriority: ["Bloodthirsty Slaughter", "Crimson Rose", "Lone Flower", "Blood Blade"],
    summary: "A burst carry who targets the enemy's biggest hitters, amplifies their damage taken, and stuns them.",
    unlock: "Enters the hero list once the server is 34 days old, and 10 Red Lady Shards unlock her.",
    skills: [
      { kind: "Auto", name: "Blood Blade", effect: "Throws a scalpel, dealing 87.15% to 249% ATK Energy DMG to a single enemy", starUpgrades: ["Star 5: Deals 40% extra damage", "Star 25: Extra damage increases to 100%", "Star 50: Extra damage increases to 200%"], maxStars: "At star 50: 261.45% to 747%" },
      { kind: "Ultimate", name: "Crimson Rose", cooldown: "15s", unlock: "Hero Lv 5", effect: "Summons the Crimson Rose, dealing 628.95% to 1,797% ATK Energy DMG to the 2 highest-ATK enemies, with a 35% chance to stun targets for 5s.", starUpgrades: ["Star 10: Deals 40% extra damage", "Star 30: Attack Target +1", "Star 50: Extra damage increases to 140%"], maxStars: "At star 50: 1,592.64% to 4,550.4%" },
      { kind: "Active", name: "Bloodthirsty Slaughter", cooldown: "5s", unlock: "Hero Lv 10", effect: "Locks onto a target, dealing 342.3% to 978% ATK as Energy Dmg to it, and increasing damage they take by 8.2% to 16% for 3s.", starUpgrades: ["Star 15: Deals 40% extra damage", "Star 35: Extra damage increases to 100%", "Star 45: Extra damage increases to 200%"], maxStars: "At star 45: 1,026.9% / 8.2% to 2,934% / 16%" },
      { kind: "Passive", name: "Lone Flower", unlock: "Hero Lv 20", effect: "In combat, increases 8.2% to 16% ATK.", starUpgrades: ["Star 20: Effect increases by 1.6%", "Star 45: Effect increases by 2.4%", "Star 50: Effect increases by 4%"], maxStars: "At star 50: 16.2% to 24%" },
      { kind: "Support", name: "Tenacity", unlock: "Hero Lv 30 · star 40", effect: "ATK, HP, and DEF +20%; skill cooldown speed +10%." },
    ],
    overview: [
      "Red Lady is one of the most consistent damage dealers in the game, in both PvE and PvP. Her kit is built to find the targets that matter: Crimson Rose goes straight for the enemy's two highest-ATK heroes, with a 35% chance to stun them for 5 seconds — and a stunned carry can decide a fight.",
      "Bloodthirsty Slaughter is huge on its own and also makes its target take more damage from everyone else, so she sets up kills as well as finishing them.",
    ],
    investment: "Light spenders can stop at 8★ and save UR Omni shards. Mid spenders should go to 9★ for stronger scaling, and whales to 10★ for full damage and the best stun impact.",
    squadFit: "A Ranger carry who fits beside Cynthia, Shadow, Louis and Bell. Bell's Inspiration is aimed at your two highest-ATK allies, which is usually her. Watch out for enemy Billy, whose ultimate gives stun resistance.",
    pairsWith: ["bell", "cynthia", "shadow", "louis"],
  },
  {
    slug: "annie",
    name: "Annie",
    rarity: "UR",
    faction: "Warlock",
    role: "Carry",
    tier: "Solid",
    image: "/images/heroes/annie.webp",
    maxStats: { attack: "24,276", hp: "1,274,692", defense: "14,374", command: "350" },
    power: "916,394",
    attackInterval: "0.83s",
    skillPriority: ["Candy Jar", "Surprise Gift", "Charged Gummies", "Candy"],
    summary: "An AoE Burn specialist who clears waves and keeps chipping damage long after she's attacked.",
    unlock: "Unlocks once the server is 13 days old — the same day as Joker — with 10 Annie Shards. No premium pack gates her, so a free account can reach her by saving shards.",
    skills: [
      { kind: "Auto", name: "Candy", effect: "Waves a magic wand to conjure a candy, dealing 87.15% to 249% ATK Energy DMG to a single enemy.", starUpgrades: ["Star 5: Deals 40% extra damage", "Star 25: Extra damage increases to 100%", "Star 50: Extra damage increases to 200%.Awakening level 1: Waves a wand, conjuring a candy to deal 747% ATK Energy DMG to a single enemy with a 50% Probabilities to inflict Burn for 2s, dealing 200% ATK Energy DMG per second. When the team successfully applies Burn, additionally inflicts 1 stack of ScorchAwakening level 40: Waves a wand, conjuring a candy to deal 747% ATK Energy DMG to a single enemy with a 50% Probabilities to inflict Burn on the target and any 1 enemy DPS for 2s, dealing 200% ATK Energy DMG per second. When the team successfully applies Burn, additionally inflicts 1 stack of Scorch"], maxStars: "At star 50: 261.45% to 747%" },
      { kind: "Ultimate", name: "Candy Jar", cooldown: "15s", unlock: "Hero Lv 5", effect: "Summons 2 explosive candy jars, targeting the 2 enemies with the highest ATK, dealing 414.54% to 1,184.4% ATK DMG, and inflicting Burn, causing 100% ATK damage per second for 5s.", starUpgrades: ["Star 10: Attack Target +1", "Star 30: If the target is Burning, deals an additional 900% Attack Damage once", "Star 50: Deals 200% extra damage.Awakening level 20: Summons 2 explosive candy jars, targeting the 2 enemies with the highest ATK, dealing 3,553.2% ATK DMG, and inflicting Burn, causing 100% ATK damage per second for 5s. Additionally deals 1 instance of Energy DMG equal to Annie's 250% ATK x target's Scorch stacks to all enemies with Scorch"], maxStars: "At star 50: 1,243.62% to 3,553.2%" },
      { kind: "Active", name: "Surprise Gift", cooldown: "4.5s", unlock: "Hero Lv 10", effect: "Throws a gift box, dealing 187.95% to 537% ATK Energy DMG to enemies within range and causing them to Burn, inflicting 100% ATK Energy DMG per second for 2s.", starUpgrades: ["Star 15: Burning Duration +2s", "Star 35: Deals 100% extra damage", "Star 45: Extra damage increases to 200%.Awakening level 10: Throws a gift box, dealing 1,611% ATK Energy DMG to enemies within range and causing them to Burn, inflicting 100% ATK Energy DMG per second for 2s. Damage increased by an additional 15%, plus 4% for each stack of Scorch the target has"], maxStars: "At star 45: 563.85% to 1,611%" },
      { kind: "Passive", name: "Charged Gummies", unlock: "Hero Lv 20", effect: "In combat, increases Energy DMG dealt by 8.2% to 16%.", starUpgrades: ["Star 20: Effect increases by 1.6%", "Star 45: Effect increases by 2.4%", "Star 50: Effect increases by 4%"], maxStars: "At star 50: 16.2% to 24%" },
      { kind: "Support", name: "Tenacity", unlock: "Hero Lv 30 · star 40", effect: "ATK, HP, and DEF +20%; skill cooldown speed +10%." },
    ],
    overview: [
      "Annie is about consistency rather than burst. Both her big skills hit wide and leave Burn behind, so enemies keep taking damage after the hit lands. Surprise Gift also has a faster cooldown than most actives at 4.5 seconds.",
      "That makes her a reliable PvE damage dealer who clears waves efficiently. She still works in PvP, but her damage there is lower than the top burst carries.",
    ],
    investment: "7–8★ is plenty if most of your investment is going into PvP. If you're PvE-focused, 9–10★ is where she really pays off.",
    squadFit: "Her Burn is what makes Nicole hit harder — Inferno Array does up to 40% bonus damage to Burning targets (45% with full stars) — so the two are a natural pair. Joker's lowest-HP targeting finishes off what her Burn softens up in a Warlock squad.",
    pairsWith: ["nicole", "joker", "billy", "ulfrid"],
  },
  {
    slug: "joker",
    name: "Joker",
    rarity: "UR",
    faction: "Warlock",
    role: "Carry",
    tier: "Solid",
    image: "/images/heroes/joker.webp",
    maxStats: { attack: "23,158", hp: "1,341,781", defense: "14,534", command: "350" },
    power: "913,583",
    attackInterval: "0.83s",
    skillPriority: ["Joker Ace", "Hearthunt Red Card", "Frenzied Emotion", "Deal Cards"],
    summary: "A card-throwing executioner who goes straight for the lowest-HP enemies and finishes them.",
    unlock: "Available once the server is 13 days old, the same day as Annie, and 10 Joker Shards unlock him. No premium pack gates him. Some sources still call him Jester.",
    skills: [
      { kind: "Auto", name: "Deal Cards", effect: "Throws a card, dealing 87.15% to 249% ATK Physical DMG to the lowest HP target.", starUpgrades: ["Star 5: Deals 40% extra damage", "Star 25: Extra damage increases to 100%", "Star 50: Extra damage increases to 200%"], maxStars: "At star 50: 261.45% to 747%" },
      { kind: "Ultimate", name: "Joker Ace", cooldown: "15s", unlock: "Hero Lv 5", effect: "Throws 2 joker cards, dealing 706.65% to 2,019% ATK Physical DMG to 2 lowest-HP enemies.", starUpgrades: ["Star 10: Deals 40% extra damage", "Star 30: Extra damage increases to 150%", "Star 50: Attack Target +1"], maxStars: "At star 50: 1,766.63% to 5,047.5%" },
      { kind: "Active", name: "Hearthunt Red Card", cooldown: "5s", unlock: "Hero Lv 10", effect: "Throws a heart card, dealing 283.5% to 810% ATK as Physical DMG to 2 random targets.", starUpgrades: ["Star 15: Deals 40% extra damage", "Star 35: Extra damage increases to 100%", "Star 45: Inflicts Burn on the target, dealing 400% Attack Damage per second for 3s"], maxStars: "At star 45: 567% to 1,620%" },
      { kind: "Passive", name: "Frenzied Emotion", unlock: "Hero Lv 20", effect: "In combat, increases 8.2% to 16% Crit Rate.", starUpgrades: ["Star 20: Effect increases by 1.6%", "Star 45: Effect increases by 2.4%", "Star 50: Effect increases by 4%"], maxStars: "At star 50: 16.2% to 24%" },
      { kind: "Support", name: "Tenacity", unlock: "Hero Lv 30 · star 40", effect: "ATK, HP, and DEF +20%; skill cooldown speed +10%." },
    ],
    overview: [
      "Joker is a finisher. His auto attack and his ultimate both aim for the enemies with the least HP left, and Joker Ace hits the two lowest-HP enemies for up to 2,019% ATK each (5,047.5% with full stars) — enough to delete a hero that's already been softened up.",
      "He's at his strongest early to mid game, where that burst can end fights quickly. He's good in PvP too, but he's star-dependent. He's also the only UR carry who deals Physical damage, which matters when the enemy is stacking Energy resistance (Shadow, Billy, Louis).",
    ],
    investment: "He's star-dependent, so a half-built Joker underperforms. 8★ for Tenacity is the first target before deciding whether to go further.",
    squadFit: "He finishes what the rest of the squad softens up — his auto attack and ultimate both go for the lowest-HP enemies — and he pairs naturally with Annie and Nicole in a Warlock squad. His Physical damage is a good counter to Energy-resistant lineups.",
    pairsWith: ["nicole", "annie", "billy"],
  },
  {
    slug: "harper",
    name: "Harper",
    rarity: "UR",
    faction: "Warrior",
    role: "Support",
    tier: "Strong",
    image: "/images/heroes/harper.webp",
    maxStats: { attack: "20,762", hp: "1,565,411", defense: "15,013", command: "350" },
    power: "920,570",
    attackInterval: "0.83s",
    skillPriority: ["Vitality Bubble", "War Flute Sound", "Warrior's Anthem", "Bubble"],
    summary: "The best offensive support in the game — a repeating ATK buff for the whole squad, and more for Warriors.",
    unlock: "Appears once the server is 20 days old, and 10 Harper Shards unlock him. He doesn't depend on a premium pack.",
    skills: [
      { kind: "Auto", name: "Bubble", effect: "Plays a flute to create bubbles, dealing 87.15% to 249% ATK as Energy DMG to a single enemy.", starUpgrades: ["Star 5: Deals 40% extra damage", "Star 25: Extra damage increases to 100%", "Star 50: Extra damage increases to 200%"], maxStars: "At star 50: 261.45% to 747%" },
      { kind: "Ultimate", name: "War Flute Sound", cooldown: "14s", unlock: "Hero Lv 5", effect: "Harper plays a war flute to inspire allies, increasing all allied heroes' ATK by 15.38% to 30% for 5s.", starUpgrades: ["Star 10: After being casted, increases Energy DMG dealt by all allies by 4.5% for 7s", "Star 30: ATK bonus increases by 4.5%", "Star 50: ATK bonus duration +5s"], maxStars: "At star 50: 19.88% to 34.5%" },
      { kind: "Active", name: "Vitality Bubble", cooldown: "5s", unlock: "Hero Lv 10", effect: "Harper creates a bubble, reducing the damage received by the lowest-HP ally by 8.2% to 16% for 4s.", starUpgrades: ["Star 15: Effect increases by 1.6%", "Star 35: Effect increases by 2.4%", "Star 45: Target +1"], maxStars: "At star 45: 12.2% to 20%" },
      { kind: "Passive", name: "Warrior's Anthem", unlock: "Hero Lv 20", effect: "In battle, increases ATK of all allied Warrior Heroes by 6.15% to 12%.", starUpgrades: ["Star 20: Effect increases by 1.2%", "Star 45: Effect increases by 1.8%", "Star 50: Effect increases by 3%"], maxStars: "At star 50: 12.15% to 18%" },
      { kind: "Support", name: "Tenacity", unlock: "Hero Lv 30 · star 40", effect: "ATK, HP, and DEF +20%; skill cooldown speed +10%." },
    ],
    overview: [
      "Harper doesn't do much damage himself — he makes everyone else do more. War Flute Sound raises every ally's ATK by up to 30% for 5 seconds, every 14 seconds (34.5% with full stars), and Warrior's Anthem permanently adds up to 12% ATK to every Warrior on the team (18% with full stars). Those two stack.",
      "Vitality Bubble is the small extra that keeps your weakest hero alive a little longer. Put together, he's the best offensive support in the game.",
    ],
    investment: "He's second in line for UR Omni shards after Marlena. Get him to 8★ for Tenacity, which also shortens the gap between his ATK buffs.",
    squadFit: "He's best with as many Warriors as you can field — Arthur, Daskal, Marlena and Zoya all get his passive. He's the support in BF2's full-roster squad. Until he unlocks on server day 20, Celia or Stellar can hold the support slot.",
    pairsWith: ["marlena", "arthur", "daskal", "zoya"],
  },
  {
    slug: "bell",
    name: "Bell",
    rarity: "UR",
    faction: "Ranger",
    role: "Support",
    tier: "Solid",
    image: "/images/heroes/bell.webp",
    maxStats: { attack: "20,762", hp: "1,565,411", defense: "15,013", command: "350" },
    power: "920,570",
    attackInterval: "0.83s",
    exclusiveWeapon: "Tiny Drum",
    skillPriority: ["Healing Sound", "Inspiration", "Battle Anthem", "Musical Note"],
    summary: "The Ranger mirror of Harper — buffs your two hardest hitters directly and heals your weakest ally.",
    unlock: "Enters the hero list once the server is 69 days old, and 10 Bell Shards unlock her.",
    skills: [
      { kind: "Auto", name: "Musical Note", effect: "Waves a bell to release musical notes, dealing 87.15% to 249% ATK Physical DMG to a single target.", starUpgrades: ["Star 5: Deals 40% extra damage", "Star 25: Extra damage increases to 100%", "Star 50: Extra damage increases to 200%"], maxStars: "At star 50: 261.45% to 747%" },
      { kind: "Ultimate", name: "Inspiration", cooldown: "14s", unlock: "Hero Lv 5", effect: "Inspires the 2 highest-ATK allies, increasing their ATK by 25.63% to 50% for 5s.", starUpgrades: ["Star 10: Effect increases by 5%", "Star 30: Effect Duration +2s", "Star 50: Target +1"], maxStars: "At star 50: 30.63% to 55%" },
      { kind: "Active", name: "Healing Sound", cooldown: "5s", unlock: "Hero Lv 10", effect: "Heals the lowest-HP ally for 63% to 180% ATK.", starUpgrades: ["Star 15: Restores 40% extra HP", "Star 35: Extra HP recovery increases to 100%", "Star 45: Extra HP recovery increases to 200%"], maxStars: "At star 45: 189% to 540%" },
      { kind: "Passive", name: "Battle Anthem", unlock: "Hero Lv 20", effect: "During battle, increases ATK of all allied Ranger Heroes by 6.15% to 12%.", starUpgrades: ["Star 20: Effect increases by 1.2%", "Star 45: Effect increases by 1.8%", "Star 50: Effect increases by 3%"], maxStars: "At star 50: 12.15% to 18%" },
      { kind: "Support", name: "Tenacity", unlock: "Hero Lv 30 · star 40", effect: "ATK, HP, and DEF +20%; skill cooldown speed +10%." },
    ],
    overview: [
      "Bell does for Rangers what Harper does for Warriors. Battle Anthem gives every Ranger on the team up to +12% ATK (18% with full stars), and Inspiration hands your two highest-ATK heroes up to +50% ATK for 5 seconds (55% with full stars) — a narrower buff than Harper's, but much stronger on the heroes that matter.",
      "Healing Sound gives her something Harper doesn't have: a real heal every 5 seconds on your lowest-HP ally.",
    ],
    investment: "There's no specific star target in our notes yet. 8★ for Tenacity is the safe first milestone, and it also brings her buff cycle around faster.",
    squadFit: "She's at her best in an all-Ranger squad with Shadow, Cynthia, Red Lady and Louis, where her passive buffs everyone and Inspiration lands on Cynthia and Red Lady.",
    pairsWith: ["shadow", "cynthia", "red-lady", "louis"],
  },
  {
    slug: "nicole",
    name: "Nicole",
    rarity: "UR",
    faction: "Warlock",
    role: "Support",
    tier: "Solid",
    image: "/images/heroes/nicole.webp",
    maxStats: { attack: "20,762", hp: "1,565,411", defense: "15,013", command: "350" },
    power: "920,570",
    attackInterval: "0.83s",
    skillPriority: ["Heartwarming Flame", "Inferno Array", "Flame Soul Power", "Ember Dust"],
    summary: "A dedicated healer with an offensive edge — her ultimate hits much harder against Burning enemies.",
    unlock: "The last UR hero to arrive: she appears once the server is 97 days old, and 10 Nicole Shards unlock her.",
    skills: [
      { kind: "Auto", name: "Ember Dust", effect: "Releases flame to inflict 87.15% to 249% ATK Physical DMG to a single target, and heals the ally with the lowest HP for 10k + 50% of ATK.", starUpgrades: ["Star 5: Deals 40% extra damage and restores 5k HP", "Star 25: Extra damage increases to 100%, extra HP recovery increases to 15k", "Star 50: Extra damage increases to 200%, extra HP recovery increases to 30k"], maxStars: "At star 50: 261.45% to 747%" },
      { kind: "Ultimate", name: "Inferno Array", cooldown: "15s", unlock: "Hero Lv 5", effect: "Summons a pillar of fire, dealing 367.5% to 1,050% ATK Physical DMG to all enemies. If targets are Burning, damage increases by 20.5% to 40%.", starUpgrades: ["Star 10: Deals 100% extra damage", "Star 30: Extra damage increases to 200%", "Star 50: Damage from Burn status increases by 5%"], maxStars: "At star 50: 1,102.5% / 25.5% to 3,150% / 45%" },
      { kind: "Active", name: "Heartwarming Flame", cooldown: "5s", unlock: "Hero Lv 10", effect: "Throws 2 fireballs, healing the 2 lowest-HP allies for 80k + 27.3% to 78% ATK.", starUpgrades: ["Star 15: Restores 80k extra HP, healing ATK bonus increases by an extra 70%", "Star 35: Restores 150k extra HP, healing ATK bonus increases by an extra 140%", "Star 45: Restores 250k extra HP, healing ATK bonus increases by an extra 210%"], maxStars: "At star 45: 84.63% to 241.8%" },
      { kind: "Passive", name: "Flame Soul Power", unlock: "Hero Lv 20", effect: "In battle, all allied Warlock Heroes ATK +4.1% to 8%", starUpgrades: ["Star 20: All allied Warlock Heroes' Attack Speed +3.5%", "Star 45: ATK bonus increases by 2%", "Star 50: All Warlock Heroes Attack Speed +6.5%"], maxStars: "At star 50: 6.1% to 10%" },
      { kind: "Support", name: "Tenacity", unlock: "Hero Lv 30 · star 40", effect: "ATK, HP, and DEF +20%; skill cooldown speed +10%." },
    ],
    overview: [
      "Nicole is the game's most dedicated healer. Every auto attack heals someone, and Heartwarming Flame heals your two lowest-HP heroes every 5 seconds. But she isn't just a healer — Inferno Array hits every enemy and does up to 40% more damage to anything already Burning (45% with full stars).",
      "Her passive is the reason she belongs in a Warlock squad specifically. Flame Soul Power gives every allied Warlock up to +8% ATK (10% with full stars), so she's at her best when most of the lineup shares her faction.",
    ],
    investment: "There's no specific star target in our notes yet. 8★ for Tenacity is the first milestone; push further if she's a fixed part of your Warlock squad.",
    squadFit: "She pairs especially well with Annie, whose Burns set up her ultimate's bonus damage, and with Joker. Fill the front with Billy or Ulfrid to keep her Warlock ATK bonus on every slot.",
    pairsWith: ["annie", "joker", "billy", "ulfrid"],
  },

  // ───────────────────────── SSR heroes ─────────────────────────
  {
    slug: "bella",
    name: "Bella",
    rarity: "SSR",
    faction: "Warrior",
    role: "Tank",
    image: "/images/heroes/bella.webp",
    maxStats: { attack: "8,785", hp: "1,967,947", defense: "11,181", command: "350" },
    power: "773,500",
    attackInterval: "0.87s",
    skillPriority: ["Crimson Prayer", "Bloody Requiem", "Purity", "Swing"],
    summary: "A free axe-wielding tank who shrugs off monster damage — the go-to stand-in until your UR tanks are built.",
    unlock: "Available from day one, and 10 Bella Shards unlock her. Shards drop from Tavern recruitment and event rewards, and the Alliance Shop exchanges Bella fragments.",
    skills: [
      { kind: "Auto", name: "Swing", effect: "Swings a giant axe single-handedly, dealing 81.9% to 234% ATK Physical DMG to a single target.", starUpgrades: ["Star 5: Deals 25% extra damage", "Star 25: Extra damage increases to 60%", "Star 50: Extra damage increases to 120%"], maxStars: "At star 50: 180.18% to 514.8%" },
      { kind: "Ultimate", name: "Bloody Requiem", cooldown: "7s", unlock: "Hero Lv 5", effect: "Wields dual axes with both hands, dealing 459.27% to 1,312.2% ATK DMG to targets within range and reducing their ATK by 6% for 5s.", starUpgrades: ["Star 10: Deals 25% extra damage", "Star 30: Extra damage increases to 60%", "Star 50: Extra damage increases to 120%"], maxStars: "At star 50: 1,010.39% to 2,886.84%" },
      { kind: "Active", name: "Crimson Prayer", cooldown: "5s", unlock: "Hero Lv 10", effect: "Crosses hands in prayer, reducing DMG taken from monsters by 15.38% to 30% for 3s.", starUpgrades: ["Star 15: Effect increases by 3%", "Star 35: Effect increases by 4.5%", "Star 45: Effect increases by 7.5%"], maxStars: "At star 45: 30.38% to 45%" },
      { kind: "Passive", name: "Purity", unlock: "Hero Lv 20", effect: "In combat, reduces damage taken from monsters by 8.2% to 16%.", starUpgrades: ["Star 20: Effect increases by 1.6%", "Star 45: Effect increases by 2.4%", "Star 50: Effect increases by 4%"], maxStars: "At star 50: 16.2% to 24%" },
      { kind: "Support", name: "Tenacity", unlock: "Hero Lv 30 · star 40", effect: "ATK, HP and DEF +10%" },
    ],
    overview: [
      "Bella is built for PvE. Between her passive and Crimson Prayer she can cut monster damage by a huge amount, which lets her hold the front line through early-to-mid game farming far longer than her rarity suggests.",
      "Fully built she reaches 773,500 power, among the highest of any SSR, but her own stats stay well below a UR tank's (about 1.97M HP at full stars, against Arthur's 3.0M). Her kit is mostly about monsters — Bloody Requiem also lowers enemy ATK by 6% — so she has much less to offer in PvP.",
    ],
    investment: "She's a useful starter tank if you don't have another high-star tank yet, but replace her once you do. Buying her shards from the Alliance Shop isn't recommended — there are better things to spend those coins on.",
    squadFit: "Use her to fill Arthur's second tank slot while you wait on UR tanks. Swap her out as soon as Daskal, Shadow or another UR tank is ready.",
    pairsWith: ["arthur", "marlena", "celia"],
  },
  {
    slug: "lucius",
    name: "Lucius",
    rarity: "SSR",
    faction: "Warrior",
    role: "Tank",
    image: "/images/heroes/lucius.webp",
    maxStats: { attack: "8,625", hp: "2,012,674", defense: "11,181", command: "350" },
    power: "778,239",
    attackInterval: "0.87s",
    skillPriority: ["Decapitation", "Whirlwind Cut", "God of War Blessing", "Battle Axe"],
    summary: "A two-handed axe tank with heavy single-target hits — a dependable place for SSR Omni shards.",
    unlock: "Available from day one, and 10 Lucius Shards unlock him. Shards come from the Tavern and events, and SSR Omni Shards fill any gap.",
    skills: [
      { kind: "Auto", name: "Battle Axe", effect: "Swings a great axe, dealing 81.9% to 234% ATK Physical DMG to a single enemy.", starUpgrades: ["Star 5: Deals 25% extra damage", "Star 25: Extra damage increases to 60%", "Star 50: Extra damage increases to 120%"], maxStars: "At star 50: 180.18% to 514.8%" },
      { kind: "Ultimate", name: "Whirlwind Cut", cooldown: "7s", unlock: "Hero Lv 5", effect: "Vigorously swings a great axe, dealing 373.8% to 1,068% ATK Physical DMG to a single enemy in front.", starUpgrades: ["Star 10: Deals 25% extra damage", "Star 30: Stuns enemies for an additional 1.5s", "Star 50: Extra damage increases to 90%"], maxStars: "At star 50: 710.22% to 2,029.2%" },
      { kind: "Active", name: "Decapitation", cooldown: "5s", unlock: "Hero Lv 10", effect: "Raises a great axe with both hands and smashes down, dealing 298.2% to 852% ATK Physical DMG to a single enemy.", starUpgrades: ["Star 15: Deals 25% extra damage", "Star 35: Extra damage increases to 60%", "Star 45: Extra damage increases to 120%"], maxStars: "At star 45: 656.04% to 1,874.4%" },
      { kind: "Passive", name: "God of War Blessing", unlock: "Hero Lv 20", effect: "In combat, reduces damage taken from monsters by 8.2% to 16%.", starUpgrades: ["Star 20: Effect increases by 1.6%", "Star 45: Effect increases by 2.4%", "Star 50: Effect increases by 4%"], maxStars: "At star 50: 16.2% to 24%" },
      { kind: "Support", name: "Tenacity", unlock: "Hero Lv 30 · star 40", effect: "ATK, HP and DEF +10%" },
    ],
    overview: [
      "Lucius is a solid, no-fuss tank that works for both free-to-play and paying players. Whirlwind Cut and Decapitation are both big single-enemy hits, and at 778,239 he has the highest full-build power of any SSR.",
      "His passive is monster-focused like Bella's, so he's strongest in PvE. He brings less team utility than Arthur or Griffith, which is why tier lists rate him around B.",
    ],
    investment: "He's worth putting SSR Omni shards into. Most of his shards come from the Tavern, so he's easy to keep progressing.",
    squadFit: "A good stopgap for Arthur's second tank slot until your UR tanks are built. As a Warrior he also benefits from Harper's Warrior's Anthem.",
    pairsWith: ["arthur", "harper", "claire"],
  },
  {
    slug: "griffith",
    name: "Griffith",
    rarity: "SSR",
    faction: "Ranger",
    role: "Tank",
    image: "/images/heroes/griffith.webp",
    maxStats: { attack: "8,945", hp: "1,900,858", defense: "11,021", command: "350" },
    power: "764,263",
    attackInterval: "0.93s",
    skillPriority: ["Venomous Bite", "Serpent Veil", "Serpent Resonance", "Serpent Flute"],
    summary: "A serpent-flute tank who shields the squad from monster damage and lands a big single-target bite.",
    unlock: "No server-day requirement, and 10 Griffith Shards unlock him. Shards come from events, the Alliance Shop and Tavern recruitment.",
    skills: [
      { kind: "Auto", name: "Serpent Flute", effect: "Waves the snake flute. The spirit snake deals 88.2% to 252% ATK Physical DMG to a single enemy.", starUpgrades: ["Star 5: Deals 25% extra damage", "Star 25: Extra damage increases to 60%", "Star 50: Extra damage increases to 120%"], maxStars: "At star 50: 194.04% to 554.4%" },
      { kind: "Ultimate", name: "Serpent Veil", cooldown: "7s", unlock: "Hero Lv 5", effect: "Commands a spirit snake to circle the caster, reducing monster DMG taken by allied heroes within a certain range by 15.38% to 30% for 4s.", starUpgrades: ["Star 10: Effect increases by 3%", "Star 30: Duration +1s", "Star 50: Effect increases by 6%"], maxStars: "At star 50: 24.38% to 39%" },
      { kind: "Active", name: "Venomous Bite", cooldown: "5s", unlock: "Hero Lv 10", effect: "Guides the spirit snake with the snake flute to bite the target heavily, dealing 366.45% to 1,047% ATK DMG to a single enemy.", starUpgrades: ["Star 15: Deals 25% extra damage", "Star 35: Extra damage increases to 60%", "Star 45: Extra damage increases to 120%"], maxStars: "At star 45: 806.19% to 2,303.4%" },
      { kind: "Passive", name: "Serpent Resonance", unlock: "Hero Lv 20", effect: "In combat, reduces damage taken from monsters by 8.2% to 16%.", starUpgrades: ["Star 20: Effect increases by 1.6%", "Star 45: Effect increases by 2.4%", "Star 50: Effect increases by 4%"], maxStars: "At star 50: 16.2% to 24%" },
      { kind: "Support", name: "Tenacity", unlock: "Hero Lv 30 · star 40", effect: "ATK, HP and DEF +10%" },
    ],
    overview: [
      "Griffith's strength is PvE. Serpent Veil circles him with a spirit snake that cuts the monster damage nearby allies take by up to 30% for 4 seconds (39% with full stars), and his passive cuts his own monster damage by up to 16% on top.",
      "Venomous Bite is a big single-target hit, up to 2,303.4% ATK with full stars. His reductions only work against monsters, so he's weaker in PvP, but several tier lists rate him A for PvE and boss fights.",
    ],
    investment: "A good use of SSR shards if your account leans PvE — he's a strong second tank for Rat King and other boss content. Finish his early stars before starting another tank.",
    squadFit: "He holds a front slot next to Arthur or Bella in boss squads, and can fill a Ranger-leaning squad until Shadow or Louis are built.",
    pairsWith: ["arthur", "stellar", "ash", "bestar"],
  },
  {
    slug: "hastar",
    name: "Hastar",
    rarity: "SSR",
    faction: "Warlock",
    role: "Tank",
    image: "/images/heroes/hastar.webp",
    maxStats: { attack: "9,424", hp: "1,766,680", defense: "11,021", command: "350" },
    power: "750,047",
    attackInterval: "0.9s",
    skillPriority: ["Wrath of Old Gods", "Undercurrent", "Scorn Guard", "Lash"],
    summary: "A tentacled Warlock tank who stuns, hits hard, and shields himself when things get desperate.",
    unlock: "No server-day requirement, and 10 Hastar Shards unlock him. Shards come from Tavern draws and events, and an SSR Omni Shard can stand in for a missing one.",
    skills: [
      { kind: "Auto", name: "Lash", effect: "Lashes a single enemy with tentacles, dealing 85.05% to 243% ATK Energy DMG.", starUpgrades: ["Star 5: Deals 25% extra damage", "Star 25: Extra damage increases to 60%", "Star 50: Extra damage increases to 120%"], maxStars: "At star 50: 187.11% to 534.6%" },
      { kind: "Ultimate", name: "Wrath of Old Gods", cooldown: "7s", unlock: "Hero Lv 5", effect: "Slams the ground with a massive tentacle, dealing 576.45% to 1,647% ATK as Energy DMG to enemies in front.", starUpgrades: ["Star 10: Deals 25% extra damage", "Star 30: Extra damage increases to 60%", "Star 50: Extra damage increases to 120%"], maxStars: "At star 50: 1,268.19% to 3,623.4%" },
      { kind: "Active", name: "Undercurrent", cooldown: "5s", unlock: "Hero Lv 10", effect: "Tentacles emerge from the ground, knocking the enemy into the air, dealing 207.9% to 594% ATK Energy DMG to a single enemy and stunning them for 1s.", starUpgrades: ["Star 15: Deals 25% extra damage", "Star 35: Extra damage increases to 60%", "Star 45: Extra damage increases to 120%"], maxStars: "At star 45: 457.38% to 1,306.8%" },
      { kind: "Passive", name: "Scorn Guard", unlock: "Hero Lv 20", effect: "In combat, when HP drops below 40% for the first time, gains a shield equal to 3.15% to 9% of current max HP, which absorbs 50% of incoming damage for 5s.", starUpgrades: ["Star 20: Shield effect increases by 25%", "Star 45: Shield Duration +2s", "Star 50: Shield effect increases by 55%"], maxStars: "At star 50: 5.67% to 16.2%" },
      { kind: "Support", name: "Tenacity", unlock: "Hero Lv 30 · star 40", effect: "ATK, HP and DEF +10%" },
    ],
    overview: [
      "Hastar is one of the more complete SSR tanks. He mixes crowd control, a big front-facing ultimate, and an emergency shield that kicks in right when he'd otherwise go down.",
      "Undercurrent's short stun is what sets him apart from the monster-reduction tanks — it makes him useful for disrupting enemies, not just surviving them.",
    ],
    investment: "A reasonable place for SSR shards if you're building toward a Warlock squad, but he's still a placeholder until Billy or Ulfrid arrive.",
    squadFit: "The natural early tank for a Warlock lineup with Grenwald, Stellar and eventually Annie, Joker and Nicole.",
    pairsWith: ["grenwald", "stellar", "billy"],
  },
  {
    slug: "claire",
    name: "Claire",
    rarity: "SSR",
    faction: "Warrior",
    role: "Carry",
    image: "/images/heroes/claire.webp",
    maxStats: { attack: "15,174", hp: "916,885", defense: "9,744", command: "350" },
    power: "685,150",
    attackInterval: "1s",
    skillPriority: ["Celestial Judgment", "Rain of Arrows", "Call of the Brave", "Holy Banner"],
    summary: "One of the best SSR carries — high burst, steady output, and a monster-damage buff for her fellow Warriors.",
    unlock: "No server-day requirement or premium pack, and 10 Claire Shards unlock her. Claire's Advanced Mark, used in a designated event screen, later promotes her to her UR form.",
    skills: [
      { kind: "Auto", name: "Holy Banner", effect: "Swings a flag, dealing 94.5% to 270% ATK Physical DMG to a single enemy.", starUpgrades: ["Star 5: Deals 25% extra damage", "Star 25: Extra damage increases to 60%", "Star 50: Extra damage increases to 120%"], maxStars: "At star 50: 207.9% to 594%" },
      { kind: "Ultimate", name: "Celestial Judgment", cooldown: "8s", unlock: "Hero Lv 5", effect: "Raises the battle flag with both hands, summoning a giant holy sword to pierce the ground, dealing 406.77% to 1,162.2% ATK Physical DMG to enemies within range.", starUpgrades: ["Star 10: Increases damage to monsters by 8% for 7s", "Star 30: Deals 35% extra damage each time", "Star 50: Extra damage each time increases to 95%"], maxStars: "At star 50: 793.2% to 2,266.29%" },
      { kind: "Active", name: "Rain of Arrows", cooldown: "5s", unlock: "Hero Lv 10", effect: "Waves the battle flag, unleashing arrows for 5 rapid attacks on a single target, each dealing 96.6% to 276% ATK Physical DMG.", starUpgrades: ["Star 15: Deals 25% extra damage", "Star 35: Extra damage increases to 60%", "Star 45: Extra damage increases to 120%"], maxStars: "At star 45: 212.52% to 607.2%" },
      { kind: "Passive", name: "Call of the Brave", unlock: "Hero Lv 20", effect: "In battle, the 3 Warriors with the highest ATK in the team deal 8.2% to 16% more damage to monsters.", starUpgrades: ["Star 20: Effect increases by 1.6%", "Star 45: Effect increases by 2.4%", "Star 50: Effect increases by 4%"], maxStars: "At star 50: 16.2% to 24%" },
      { kind: "Support", name: "Tenacity", unlock: "Hero Lv 30 · star 40", effect: "ATK, HP and DEF +10%" },
    ],
    overview: [
      "Claire is the SSR carry most players should build. Rain of Arrows lands five hits every five seconds, Celestial Judgment adds a big area hit, and her passive makes your three highest-ATK Warriors deal up to 16% more damage to monsters (24% with full stars).",
      "She performs reliably in both PvE and PvP, and with proper investment she pulls well ahead of Celia. She's also the only hero with a second form: Claire's Advanced Mark promotes her to Claire UR. The change is one-way, sources disagree on how much progress carries over, and one guide ties it to the second week of the Era of Revival event.",
    ],
    investment: "Worth investing SSR Omni shards into, especially since she can later be promoted to UR. She needs no server day or premium pack, so she's easy to start on.",
    squadFit: "She's at her best on a Warrior-heavy team, where her passive boosts Arthur, Marlena and your other Warriors against monsters. A strong second carry next to Marlena early on.",
    pairsWith: ["marlena", "arthur", "harper", "lucius"],
  },
  {
    slug: "kesso",
    name: "Kesso",
    rarity: "SSR",
    faction: "Warrior",
    role: "Carry",
    image: "/images/heroes/kesso.webp",
    maxStats: { attack: "15,015", hp: "939,248", defense: "9,744", command: "350" },
    power: "686,515",
    attackInterval: "0.9s",
    skillPriority: ["Hunting Skills", "Summon Warhawk", "Wild Survival", "Spear Throw"],
    summary: "A spear-thrower with a war-eagle summon and a clutch ATK spike when he's about to go down.",
    unlock: "Free from the start, and 10 Kesso Shards unlock him. Shards come from the Tavern and events, and SSR Omni Shards cover what's missing.",
    skills: [
      { kind: "Auto", name: "Spear Throw", effect: "Throws a spear, dealing 94.5% to 270% ATK Physical DMG to a single enemy.", starUpgrades: ["Star 5: Deals 25% extra damage", "Star 25: Extra damage increases to 60%", "Star 50: Extra damage increases to 120%"], maxStars: "At star 50: 207.9% to 594%" },
      { kind: "Ultimate", name: "Summon Warhawk", cooldown: "9s", unlock: "Hero Lv 5", effect: "Blows a whistle to summon a war eagle, which attacks with 105% to 300% of Kesso's ATK and 25% HP for 10s.", starUpgrades: ["Star 10: Rex's inherited ATK increases by 40%", "Star 30: Rex's inherited ATK increases by 60%", "Star 50: Rex's inherited ATK increases by 100%"], maxStars: "At star 50: 305% to 500%" },
      { kind: "Active", name: "Hunting Skills", cooldown: "5s", unlock: "Hero Lv 10", effect: "Quickly throws 2 spears, randomly attacking 2 enemies, each dealing 350.7% to 1,002% ATK Physical DMG.", starUpgrades: ["Star 15: Deals 20% extra damage", "Star 35: Split Shot +1", "Star 45: Extra damage increases to 50%"], maxStars: "At star 45: 526.05% to 1,503%" },
      { kind: "Passive", name: "Wild Survival", unlock: "Hero Lv 20", effect: "In combat, increases ATK by 20.5% to 40% for 5s when your HP drops below 30% for the first time.", starUpgrades: ["Star 20: Effect increases by 4%", "Star 45: Effect increases by 2% and Duration +1s", "Star 50: Effect increases by 10%"], maxStars: "At star 50: 36.5% to 56%" },
      { kind: "Support", name: "Tenacity", unlock: "Hero Lv 30 · star 40", effect: "ATK, HP and DEF +10%" },
    ],
    overview: [
      "Kesso is good in both PvP and PvE. His Warhawk scales off his HP as well as his ATK, and Hunting Skills keeps two spears flying every five seconds.",
      "Wild Survival is the fun part: the first time his HP drops below 30%, he gains up to +40% ATK for 5 seconds (56% with full stars). Timed well, that turns a losing exchange into a win.",
    ],
    investment: "Tier lists rate him around B, so make him your fourth or fifth SSR to star up rather than an early priority.",
    squadFit: "A Warrior carry, so Harper's passive and Claire's monster buff both apply to him.",
    pairsWith: ["claire", "harper", "marlena"],
  },
  {
    slug: "sivir",
    name: "Sivir",
    rarity: "SSR",
    faction: "Warrior",
    role: "Carry",
    image: "/images/heroes/sivir.webp",
    maxStats: { attack: "15,174", hp: "916,885", defense: "9,744", command: "350" },
    power: "685,150",
    attackInterval: "0.83s",
    skillPriority: ["Shield Strike", "Wild Pursuit", "Hunter Bloodline", "Hunt"],
    summary: "A broken-spear fighter with a flat ATK passive — a straightforward all-round PvP carry.",
    unlock: "Available from day one, and 10 Sivir Shards unlock her. Shards come from the Tavern and events.",
    skills: [
      { kind: "Auto", name: "Hunt", effect: "Throws a broken spear, dealing 78.75% to 225% ATK Physical DMG to a single enemy.", starUpgrades: ["Star 5: Deals 25% extra damage", "Star 25: Extra damage increases to 60%", "Star 50: Extra damage increases to 120%"], maxStars: "At star 50: 173.25% to 495%" },
      { kind: "Ultimate", name: "Wild Pursuit", cooldown: "8s", unlock: "Hero Lv 5", effect: "Throws 2 broken spears, randomly attacking 2 enemies, each dealing 350.7% to 1,002% ATK Physical DMG.", starUpgrades: ["Star 10: Deals 20% extra damage", "Star 30: Attack Target +1", "Star 50: Extra damage increases to 50%"], maxStars: "At star 50: 526.05% to 1,503%" },
      { kind: "Active", name: "Shield Strike", cooldown: "5s", unlock: "Hero Lv 10", effect: "Throws a shield, dealing 300.3% to 858% ATK Physical DMG to a single enemy.", starUpgrades: ["Star 15: Deals 25% extra damage", "Star 35: Extra damage increases to 60%", "Star 45: Extra damage increases to 120%"], maxStars: "At star 45: 660.66% to 1,887.6%" },
      { kind: "Passive", name: "Hunter Bloodline", unlock: "Hero Lv 20", effect: "In combat, increases ATK by 8.2% to 16%.", starUpgrades: ["Star 20: Effect increases by 1.6%", "Star 45: Effect increases by 2.4%", "Star 50: Effect increases by 4%"], maxStars: "At star 50: 16.2% to 24%" },
      { kind: "Support", name: "Tenacity", unlock: "Hero Lv 30 · star 40", effect: "ATK, HP and DEF +10%" },
    ],
    overview: [
      "Sivir is an all-around PvP carry. Hunter Bloodline is a flat ATK boost — up to 16%, or 24% with full stars — that works everywhere, not just against monsters, which is what makes Sivir better suited to player fights than the PvE-focused SSR carries.",
      "Shield Strike is the reliable single-target hit, and Wild Pursuit adds two random spear hits on the ultimate.",
    ],
    investment: "A decent SSR to build if you want a PvP-leaning carry before your URs come online.",
    squadFit: "Fits a Warrior squad alongside Marlena and Harper.",
    pairsWith: ["marlena", "harper", "claire"],
  },
  {
    slug: "ash",
    name: "Ash",
    rarity: "SSR",
    faction: "Ranger",
    role: "Carry",
    image: "/images/heroes/ash.webp",
    maxStats: { attack: "14,695", hp: "961,611", defense: "9,744", command: "350" },
    power: "685,873",
    skillPriority: ["Eagle Spirit Hunt", "One Stone Two Birds", "Focus", "Precision Shot"],
    summary: "A reliable single-target archer who shines in PvE and boss fights, and buffs your top Rangers against monsters.",
    unlock: "Available from day one, and 10 Ash Shards unlock her. Shards drop from Tavern recruitment and events, with no server age or premium pack needed.",
    skills: [
      { kind: "Auto", name: "Precision Shot", effect: "Shoots an arrow, dealing 81.9% to 234% ATK Physical DMG to a single target.", starUpgrades: ["Star 5: Deals 25% extra damage", "Star 25: Extra damage increases to 60%", "Star 50: Extra damage increases to 120%"], maxStars: "At star 50: 180.18% to 514.8%" },
      { kind: "Ultimate", name: "Eagle Spirit Hunt", cooldown: "8s", unlock: "Hero Lv 5", effect: "Fires a giant arrow, dealing 445.2% to 1,272% ATK Physical DMG to a single target.", starUpgrades: ["Star 10: Deals 25% extra damage", "Star 30: Extra damage increases to 60%", "Star 50: Extra damage increases to 120%"], maxStars: "At star 50: 979.44% to 2,798.4%" },
      { kind: "Active", name: "One Stone Two Birds", cooldown: "5s", unlock: "Hero Lv 10", effect: "Launches 2 special arrows, randomly attacking 2 targets, each dealing 252% to 720% ATK Physical DMG.", starUpgrades: ["Star 15: Deals 25% extra damage", "Star 35: Extra damage increases to 60%", "Star 45: Extra damage increases to 120%"], maxStars: "At star 45: 554.4% to 1,584%" },
      { kind: "Passive", name: "Focus", unlock: "Hero Lv 20", effect: "In battle, the 2 Rangers with the highest ATK in the team deal 12.3% to 24% more damage to monsters", starUpgrades: ["Star 20: Effect increases by 3%", "Star 45: Effect increases by 3%", "Star 50: Effect increases by 3%"], maxStars: "At star 50: 21.3% to 33%" },
      { kind: "Support", name: "Tenacity", unlock: "Hero Lv 30 · star 40", effect: "ATK, HP and DEF +10%" },
    ],
    overview: [
      "Ash is easy to get and scales well, which makes her a great early-to-mid game investment. She's built for eliminating priority targets and handles boss fights especially well.",
      "Her passive update made her very useful in PvE — your two highest-ATK Rangers deal up to 24% more damage to monsters (33% with full stars). The weakness is a lack of AoE and utility, so she can struggle in PvP-heavy content.",
    ],
    investment: "A great early-to-mid game investment, especially if your account leans PvE.",
    squadFit: "Best in a Ranger squad, where her passive lands on Cynthia, Red Lady or Shadow.",
    pairsWith: ["cynthia", "red-lady", "bestar"],
  },
  {
    slug: "bestar",
    name: "Bestar",
    rarity: "SSR",
    faction: "Ranger",
    role: "Carry",
    image: "/images/heroes/bestar.webp",
    maxStats: { attack: "15,494", hp: "894,522", defense: "9,744", command: "350" },
    power: "685,793",
    attackInterval: "0.87s",
    skillPriority: ["Sacred Flame Kitty", "Black Cat Messenger", "Bloodstain Tracker", "Cat Bell"],
    summary: "A Bleed specialist with ghostly cat attacks who gets stronger the longer the fight goes.",
    unlock: "Free from the start, and 10 Bestar Shards unlock her. Shards come from Tavern draws and events, and an SSR Omni Shard fills a gap.",
    skills: [
      { kind: "Auto", name: "Cat Bell", effect: "Throws a cat bell, dealing 81.9% to 234% ATK Physical DMG to a single target.", starUpgrades: ["Star 5: Deals 25% extra damage", "Star 25: Extra damage increases to 60%", "Star 50: Extra damage increases to 120%"], maxStars: "At star 50: 180.18% to 514.8%" },
      { kind: "Ultimate", name: "Sacred Flame Kitty", cooldown: "8s", unlock: "Hero Lv 5", effect: "Summons a group of cat ghosts to deal 314.37% to 898.2% ATK DMG to enemies within range and inflicts Bleed, causing 15% ATK Physical DMG per second for 7s.", starUpgrades: ["Star 10: Deals 25% extra damage", "Star 30: Extra damage increases to 60%", "Star 50: Extra damage increases to 120%"], maxStars: "At star 50: 691.61% to 1,976.04%" },
      { kind: "Active", name: "Black Cat Messenger", cooldown: "5s", unlock: "Hero Lv 10", effect: "Summons 1 black cat, dealing 138.6% to 396% ATK Physical DMG to a single target, causing Bleed, inflicting 30% ATK Physical DMG per second for 3s.", starUpgrades: ["Star 15: Deals 25% extra damage", "Star 35: Extra damage increases to 60%", "Star 45: Extra damage increases to 120%"], maxStars: "At star 45: 304.92% to 871.2%" },
      { kind: "Passive", name: "Bloodstain Tracker", unlock: "Hero Lv 20", effect: "In combat, increases damage dealt to Bleeding enemies by 15.38% to 30%.", starUpgrades: ["Star 20: Effect increases by 3%", "Star 45: Effect increases by 4.5%", "Star 50: Effect increases by 7.5%"], maxStars: "At star 50: 30.38% to 45%" },
      { kind: "Support", name: "Tenacity", unlock: "Hero Lv 30 · star 40", effect: "ATK, HP and DEF +10%" },
    ],
    overview: [
      "Bestar shreds enemies over time. Both of her skills apply Bleed, and her passive adds up to 30% damage (45% with full stars) against anything that's Bleeding — so once she gets going, everything she hits takes much more.",
      "That makes her strongest in sustained fights and boss scenarios, and she scales best when she can keep Bleed applied consistently.",
    ],
    investment: "Worth building if you run a lot of boss content or long PvE fights.",
    squadFit: "A Ranger carry who pairs with Ash in an early Ranger squad.",
    pairsWith: ["ash", "cynthia", "red-lady"],
  },
  {
    slug: "grenwald",
    name: "Grenwald",
    rarity: "SSR",
    faction: "Warlock",
    role: "Carry",
    image: "/images/heroes/grenwald.webp",
    maxStats: { attack: "17,411", hp: "782,706", defense: "9,424", command: "350" },
    power: "690,773",
    attackInterval: "0.77s",
    skillPriority: ["Heartbreaker Spell", "Soul Capture Spell", "Exorcism Spell", "Cast Spell"],
    summary: "A spell-slinging Warlock with heavy single-target burst and bonus damage against monsters.",
    unlock: "Available from day one, and 10 Grenwald Shards unlock him. Shards drop from the Tavern, the Alliance Shop and events. Some sources spell his name Greenwald.",
    skills: [
      { kind: "Auto", name: "Cast Spell", effect: "Waves the wand, unleashing lightning to deal 72.45% to 207% ATK Energy DMG to a single enemy.", starUpgrades: ["Star 5: Deals 25% extra damage", "Star 25: Extra damage increases to 60%", "Star 50: Extra damage increases to 120%"], maxStars: "At star 50: 159.39% to 455.4%" },
      { kind: "Ultimate", name: "Soul Capture Spell", cooldown: "9s", unlock: "Hero Lv 5", effect: "Raises the wand, causing spirits to leave enemy bodies within range, dealing 332.85% to 951% ATK Energy DMG to all targets.", starUpgrades: ["Star 10: Deals 20% extra damage and increases ATK by 7.5% for 7s", "Star 30: Extra damage increases to 55%", "Star 50: Extra damage increases to 115%"], maxStars: "At star 50: 715.63% to 2,044.65%" },
      { kind: "Active", name: "Heartbreaker Spell", cooldown: "5s", unlock: "Hero Lv 10", effect: "Summons a soul claw, dealing 292.95% to 837% ATK Energy DMG to a single enemy.", starUpgrades: ["Star 15: Deals 25% extra damage", "Star 35: Extra damage increases to 60%", "Star 45: Extra damage increases to 120%"], maxStars: "At star 45: 644.49% to 1,841.4%" },
      { kind: "Passive", name: "Exorcism Spell", unlock: "Hero Lv 20", effect: "In combat, increases damage dealt to monsters by 10.25% to 20%.", starUpgrades: ["Star 20: Effect increases by 2%", "Star 45: Effect increases by 3%", "Star 50: Effect increases by 5%"], maxStars: "At star 50: 20.25% to 30%" },
      { kind: "Support", name: "Tenacity", unlock: "Hero Lv 30 · star 40", effect: "ATK, HP and DEF +10%" },
    ],
    overview: [
      "Grenwald specializes in high single-target burst and is especially effective in PvE, where his passive adds up to 20% damage against monsters (30% with full stars).",
      "He's a popular early stand-in carry if you can't get Marlena going right away, but he has low defense and needs a tank like Arthur in front of him to stay alive.",
    ],
    investment: "A good early carry while you're waiting on URs, especially for PvE.",
    squadFit: "Put Arthur or another sturdy tank in front of him. In a Warlock squad he works with Hastar and Stellar.",
    pairsWith: ["arthur", "hastar", "stellar"],
  },
  {
    slug: "celia",
    name: "Celia",
    rarity: "SSR",
    faction: "Warrior",
    role: "Support",
    image: "/images/heroes/celia.webp",
    maxStats: { attack: "13,098", hp: "1,118,152", defense: "10,063", command: "350" },
    power: "691,655",
    attackInterval: "0.5s",
    skillPriority: ["Ricochet Blade", "Deadly Lotus", "Ultimate Hunt", "Flying Blade"],
    summary: "A dagger-throwing PvE support who boosts monster damage and resource gains from monster kills.",
    unlock: "Available from day one, and 10 Celia Shards unlock her. Shards drop from Tavern recruitment and events.",
    skills: [
      { kind: "Auto", name: "Flying Blade", effect: "Throws a dagger, dealing 47.25% to 135% ATK Physical DMG to a single target.", starUpgrades: ["Star 5: Deals 25% extra damage", "Star 25: Extra damage increases to 60%", "Star 50: Extra damage increases to 120%"], maxStars: "At star 50: 103.95% to 297%" },
      { kind: "Ultimate", name: "Ricochet Blade", cooldown: "9s", unlock: "Hero Lv 5", effect: "Throws a dagger that ricochets 3 times, dealing 311.22% to 889.2% ATK Physical DMG to 3 random targets.", starUpgrades: ["Star 10: Deals 25% extra damage", "Star 30: Extra damage increases to 60%", "Star 50: Extra damage increases to 120%"], maxStars: "At star 50: 684.68% to 1,956.24%" },
      { kind: "Active", name: "Deadly Lotus", cooldown: "5s", unlock: "Hero Lv 10", effect: "Throws 2 daggers simultaneously, dealing 214.2% to 612% ATK Physical DMG to 2 random targets.", starUpgrades: ["Star 15: Deals 25% extra damage", "Star 35: Extra damage increases to 60%", "Star 45: Extra damage increases to 120%"], maxStars: "At star 45: 471.24% to 1,346.4%" },
      { kind: "Passive", name: "Ultimate Hunt", unlock: "Hero Lv 20", effect: "In combat, increases damage dealt to monsters by 6.15% to 12%; increases 3 types of resources obtained from defeating Resource and Elite Monsters by 20.5% to 40% for your squad.", starUpgrades: ["Star 20: Damage bonus increases by 1.2%. Resource bonus increases by 4%", "Star 45: Damage bonus increases by 1.8%. Resource bonus increases by 6%", "Star 50: Damage bonus increases by 3%. Resource bonus increases by 10%"], maxStars: "At star 50: 12.15% / 40.5% to 18% / 60%" },
      { kind: "Support", name: "Tenacity", unlock: "Hero Lv 30 · star 40", effect: "ATK, HP and DEF +10%" },
    ],
    overview: [
      "Celia is really a PvE hybrid. Her damage comes in random bursts, and her passive is the reason to run her: up to +40% resources (60% with full stars) from Resource and Elite monster kills is a big boost to your farming.",
      "Her reliance on random targeting and her weaker scaling make her less reliable long-term than a dedicated carry like Claire.",
    ],
    investment: "She's free, so she's worth using early, but don't sink heavy investment into her.",
    squadFit: "Holds the support slot until Harper unlocks on server day 20, and stays useful in a farming squad for the resource bonus.",
    pairsWith: ["arthur", "claire", "bella"],
  },
  {
    slug: "stellar",
    name: "Stellar",
    rarity: "SSR",
    faction: "Warlock",
    role: "Support",
    image: "/images/heroes/stellar.webp",
    maxStats: { attack: "12,778", hp: "1,162,878", defense: "10,223", command: "350" },
    power: "695,511",
    attackInterval: "1s",
    skillPriority: ["Destructive Comet", "Final Starlight", "Wishing Star", "Meteorite"],
    summary: "A star-themed support with real damage, a big monster-damage buff for her top Warlocks, and a clutch heal on death.",
    unlock: "Available from day one, and 10 Stellar Shards unlock her. Shards come from the Alliance Shop, events and Tavern pulls.",
    skills: [
      { kind: "Auto", name: "Meteorite", effect: "Launches a stardust, dealing 94.5% to 270% ATK Physical DMG to a single enemy.", starUpgrades: ["Star 5: Deals 25% extra damage", "Star 25: Extra damage increases to 60%", "Star 50: Extra damage increases to 120%"], maxStars: "At star 50: 207.9% to 594%" },
      { kind: "Ultimate", name: "Wishing Star", cooldown: "7s", unlock: "Hero Lv 5", effect: "Summons a meteor shower, increasing the top 2 Warlock allies' DMG to monsters by 24.6% to 48% for 5s", starUpgrades: ["Star 10: Effect increases by 4.2%", "Star 30: Duration +2s", "Star 50: Effect increases by 5.5%"], maxStars: "At star 50: 35.8% to 59.2%" },
      { kind: "Active", name: "Destructive Comet", cooldown: "5s", unlock: "Hero Lv 10", effect: "Summons a comet, dealing 346.5% to 990% ATK DMG to enemies within range.", starUpgrades: ["Star 15: Increases damage taken by monsters by 8% for 3s", "Star 35: Deals 35% extra damage", "Star 45: Extra damage increases to 95%"], maxStars: "At star 45: 675.68% to 1,930.5%" },
      { kind: "Passive", name: "Final Starlight", unlock: "Hero Lv 20", effect: "When Stellar takes fatal damage in battle, she expends her final starlight before death, healing the ally with the lowest HP for 210% to 600% ATK.", starUpgrades: ["Star 20: Restores 25% extra HP", "Star 45: Extra HP recovery increases to 60%", "Star 50: Extra HP recovery increases to 120%"], maxStars: "At star 50: 462% to 1,320%" },
      { kind: "Support", name: "Tenacity", unlock: "Hero Lv 30 · star 40", effect: "ATK, HP and DEF +10%" },
    ],
    overview: [
      "Stellar is an SSR support with real offensive teeth. Destructive Comet is a big AoE hit, and Wishing Star gives your top two Warlock allies up to 48% more damage against monsters for 5 seconds (59.2% with full stars), which makes her excellent in Warlock PvE squads.",
      "Final Starlight gives her unique clutch value — when she takes fatal damage, she heals your lowest-HP ally for up to 600% ATK (1,320% with full stars).",
    ],
    investment: "7–8★ is a good balance of damage and buffs. Going to 9★+ maximizes her PvE value and scaling.",
    squadFit: "Covers the support slot until Harper unlocks, and stays strong in PvE squads. A natural fit for an early Warlock lineup with Hastar and Grenwald.",
    pairsWith: ["grenwald", "hastar", "arthur"],
  },

  // ───────────────────────── SR heroes ─────────────────────────
  {
    slug: "durant",
    name: "Durant",
    rarity: "SR",
    faction: "Warrior",
    role: "Tank",
    image: "/images/heroes/durant.webp",
    maxStats: { attack: "7,188", hp: "1,610,139", defense: "9,105", command: "350" },
    power: "596,226",
    attackInterval: "0.87s",
    skillPriority: ["Blade Fury", "Leap Slash", "Slash"],
    summary: "A low-tier greatsword tank who's still handy for defending your territory early on.",
    unlock: "Free starter hero: 10 Durant Shards unlock him from day one. Shards drop from Tavern recruitment and events, with no server age or premium pack required.",
    skills: [
      { kind: "Auto", name: "Slash", effect: "Slashes with a sword, dealing 73.5% to 175% ATK Physical DMG to a single target.", starUpgrades: ["Star 5: Deals 15% extra damage", "Star 25: Extra damage increases to 40%", "Star 50: Extra damage increases to 80%"], maxStars: "At star 50: 132.3% to 315%" },
      { kind: "Ultimate", name: "Blade Fury", cooldown: "7s", unlock: "Hero Lv 5", effect: "Swings a greatsword with both hands twice, each time dealing 285.6% to 680% ATK Physical DMG to enemies in front.", starUpgrades: ["Star 10: Deals 15% extra damage", "Star 30: Extra damage increases to 40%", "Star 50: Extra damage increases to 80%"], maxStars: "At star 50: 514.08% to 1,224%" },
      { kind: "Active", name: "Leap Slash", cooldown: "5s", unlock: "Hero Lv 10", effect: "Leaps with a sword and strikes heavily, dealing 246.75% to 587.5% ATK Physical DMG to a single enemy.", starUpgrades: ["Star 15: Deals 15% extra damage", "Star 35: Extra damage increases to 40%", "Star 50: Extra damage increases to 80%"], maxStars: "At star 50: 444.15% to 1,057.5%" },
      { kind: "Support", name: "Unyielding", unlock: "Hero Lv 30 · star 40", effect: "ATK, HP, and DEF +5%" },
    ],
    overview: [
      "Durant is one of the four SR starter heroes and the only SR tank. He's free, sits in the hero list from day one and holds the front row in the first chapters — but every tier list rates him C, and SR skills cap at level 30 instead of 40.",
      "His kit is simple: Blade Fury swings a greatsword twice at everything in front every 7 seconds, and Leap Slash adds a heavy single-target hit every 5. His ATK is the lowest of all 31 heroes, so he's there to absorb hits, not deal damage.",
      "He's still handy for defending your territory while you're short on high-star tanks, but any SSR Warrior tank — Bella or Lucius — replaces him outright.",
    ],
    investment: "Level him only as far as the current stage needs. If you spend SR shards at all, he's the SR worth having, but keep Skill Badges and real upgrade materials for SSR and UR heroes. If you level a skill, Blade Fury comes first.",
    squadFit: "Early on he fills the second front slot next to Arthur, or anchors a day-one all-Warrior squad (Durant, Celia, Sivir, Kesso, William) for the full faction bonus. Swap him out as soon as Bella, Lucius or Daskal is ready.",
    pairsWith: ["arthur", "celia", "sivir"],
  },
  {
    slug: "william",
    name: "William",
    rarity: "SR",
    faction: "Warrior",
    role: "Carry",
    image: "/images/heroes/william.webp",
    maxStats: { attack: "12,299", hp: "760,343", defense: "7,986", command: "350" },
    power: "524,421",
    attackInterval: "0.87s",
    skillPriority: ["Twin Wind", "Whirlwind Blade", "Sword Gale"],
    summary: "A bench-tier swordsman. Fine to own early, not worth building.",
    unlock: "Free starter hero: 10 William Shards unlock him on any server, at any age. Shards come from Tavern recruitment.",
    skills: [
      { kind: "Auto", name: "Sword Gale", effect: "Unleashes a sword wind, dealing 73.5% to 175% ATK Physical DMG to a single target.", starUpgrades: ["Star 5: Deals 15% extra damage", "Star 25: Extra damage increases to 40%", "Star 50: Extra damage increases to 80%"], maxStars: "At star 50: 132.3% to 315%" },
      { kind: "Ultimate", name: "Whirlwind Blade", cooldown: "10s", unlock: "Hero Lv 5", effect: "Swings a sword wind forward, dealing 259.35% to 617.5% ATK Physical DMG to enemies in range.", starUpgrades: ["Star 10: Deals 15% extra damage", "Star 30: Extra damage increases to 40%", "Star 50: Extra damage increases to 80%"], maxStars: "At star 50: 466.83% to 1,111.5%" },
      { kind: "Active", name: "Twin Wind", cooldown: "5s", unlock: "Hero Lv 10", effect: "Swiftly unleashes 2 sword winds, striking the target twice, each dealing 165.9% to 395% ATK Physical DMG.", starUpgrades: ["Star 15: Deals 15% extra damage", "Star 35: Extra damage increases to 40%", "Star 50: Extra damage increases to 80%"], maxStars: "At star 50: 298.62% to 711%" },
      { kind: "Support", name: "Unyielding", unlock: "Hero Lv 30 · star 40", effect: "ATK, HP, and DEF +5%" },
    ],
    overview: [
      "William is an SR Warrior damage dealer and one of the four free starter heroes. Every tier list rates him C: his full-build power (524,421) is 29th of 31 heroes, and his skill cap is 30.",
      "Twin Wind fires two sword-wind hits every 5 seconds and Whirlwind Blade hits a group every 10, so the one place he's useful is clearing early monster waves.",
      "Treat him as a placeholder until you have any SSR or UR Warrior damage dealer — Claire (free from the start), Kesso, Sivir, Marlena or Zoya. They're all Warriors, so your faction bonus survives the swap.",
    ],
    investment: "Don't invest beyond what the early stages need. If you do level his skills, Twin Wind comes first, then Whirlwind Blade.",
    squadFit: "Fills the Warrior damage slot in a day-one all-Warrior squad with Durant, Celia, Sivir and Kesso. Bench him once Claire or Marlena is built.",
    pairsWith: ["durant", "celia", "claire"],
  },
  {
    slug: "robin",
    name: "Robin",
    rarity: "SR",
    faction: "Ranger",
    role: "Carry",
    image: "/images/heroes/robin.webp",
    maxStats: { attack: "11,980", hp: "782,706", defense: "7,986", command: "350" },
    power: "523,779",
    attackInterval: "0.78s",
    skillPriority: ["Arrow of Retribution", "Rapid Fire", "Aim"],
    summary: "A bench-tier archer whose rapid fire can't keep up with the real Ranger carries.",
    unlock: "Free starter hero: 10 Robin Shards unlock him from day one on any server. Shards come from Tavern recruits, and SR Omni Shards substitute for them.",
    skills: [
      { kind: "Auto", name: "Aim", effect: "Shoots a wooden arrow, dealing 65.1% to 155% ATK Physical DMG to a single enemy.", starUpgrades: ["Star 5: Deals 15% extra damage", "Star 25: Extra damage increases to 40%", "Star 50: Extra damage increases to 80%"], maxStars: "At star 50: 117.18% to 279%" },
      { kind: "Ultimate", name: "Rapid Fire", cooldown: "10s", unlock: "Hero Lv 5", effect: "Rapidly shoots a single enemy 7 times, each dealing 60.9% to 145% ATK Physical DMG.", starUpgrades: ["Star 10: Deals 15% extra damage", "Star 30: Extra damage increases to 40%", "Star 50: Extra damage increases to 80%"], maxStars: "At star 50: 109.62% to 261%" },
      { kind: "Active", name: "Arrow of Retribution", cooldown: "5s", unlock: "Hero Lv 10", effect: "Fires a special arrow, delivering a heavy blow, dealing 218.4% to 520% ATK Physical DMG to a single enemy.", starUpgrades: ["Star 15: Deals 15% extra damage", "Star 35: Extra damage increases to 40%", "Star 50: Extra damage increases to 80%"], maxStars: "At star 50: 393.12% to 936%" },
      { kind: "Support", name: "Unyielding", unlock: "Hero Lv 30 · star 40", effect: "ATK, HP, and DEF +5%" },
    ],
    overview: [
      "Robin is the SR Ranger damage dealer and one of the four free starter heroes. Every tier list rates him C, his full-build power (523,779) is 30th of 31 heroes, and his skill cap is 30.",
      "Arrow of Retribution is his best skill — up to 936% ATK on one enemy every 5 seconds with full stars — and Rapid Fire's seven arrows make him passable against early bosses.",
      "He's only the right pick on day one, before you have an SSR Ranger. Ash and Bestar are both free from the start and better in every way, and Cynthia arrives once the server is 6 days old.",
    ],
    investment: "Only level him as far as the current stage needs, and move shards and badges to an SSR or UR Ranger as soon as one arrives.",
    squadFit: "Fills the Ranger damage slot on a brand-new account. Replace him with Ash or Bestar.",
    pairsWith: ["ash", "bestar"],
  },
  {
    slug: "kafa",
    name: "Kafa",
    rarity: "SR",
    faction: "Warlock",
    role: "Carry",
    image: "/images/heroes/kafa.webp",
    maxStats: { attack: "13,098", hp: "693,254", defense: "7,827", command: "350" },
    power: "523,217",
    attackInterval: "0.83s",
    skillPriority: ["Double Expresso", "Love Infusion", "Coffee"],
    summary: "A coffee-throwing bench hero — charming, but too weak to field.",
    unlock: "Free starter hero: 10 Kafa Shards unlock her on any server, at any age. Shards come from Tavern recruits, and SR Omni Shards fill the gap.",
    skills: [
      { kind: "Auto", name: "Coffee", effect: "Throws a coffee bean, dealing 69.3% to 165% ATK Physical DMG to a single enemy.", starUpgrades: ["Star 5: Deals 15% extra damage", "Star 25: Extra damage increases to 40%", "Star 50: Extra damage increases to 80%"], maxStars: "At star 50: 124.74% to 297%" },
      { kind: "Ultimate", name: "Love Infusion", cooldown: "10s", unlock: "Hero Lv 5", effect: "Summons 2 coffee pots, pouring hot coffee over the target's head, dealing 284.76% to 678% ATK Physical DMG to enemies within range.", starUpgrades: ["Star 10: Deals 15% extra damage", "Star 30: Extra damage increases to 40%", "Star 50: Extra damage increases to 80%"], maxStars: "At star 50: 512.57% to 1,220.4%" },
      { kind: "Active", name: "Double Expresso", cooldown: "5s", unlock: "Hero Lv 10", effect: "Throws 1 cup of coffee, dealing 210% to 500% ATK Physical DMG to a single enemy.", starUpgrades: ["Star 15: Deals 15% extra damage", "Star 35: Extra damage increases to 40%", "Star 50: Extra damage increases to 80%"], maxStars: "At star 50: 378% to 900%" },
      { kind: "Support", name: "Unyielding", unlock: "Hero Lv 30 · star 40", effect: "ATK, HP, and DEF +5%" },
    ],
    overview: [
      "Kafa is the only SR Warlock damage dealer and one of the four free starter heroes. Every tier list rates her C, and her full-build power (523,217) is the lowest of all 31 heroes.",
      "Double Expresso deals up to 900% ATK to one enemy every 5 seconds with full stars, and Love Infusion's coffee pots hit a group for up to 1,220.4%. Her damage is Physical.",
      "Her one use is filling a Warlock slot before you have another Warlock. Grenwald is free from the start and much stronger, and Annie and Joker arrive once the server is 13 days old.",
    ],
    investment: "Not worth leveling past what the first chapters need. If you level a skill, Double Expresso comes first.",
    squadFit: "Fills a lone Warlock slot early, behind a tank such as Arthur or Bella with Celia in support. Replace her with Grenwald.",
    pairsWith: ["grenwald", "arthur", "celia"],
  },
];

export function getHero(slug: string) { return heroes.find((hero) => hero.slug === slug); }
