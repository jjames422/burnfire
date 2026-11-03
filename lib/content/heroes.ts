export type HeroFaction = "Warrior" | "Ranger" | "Warlock";
export type HeroRole = "Tank" | "Carry" | "Support";
export type HeroTier = "S-Tier" | "Strong" | "Solid";
export type SkillKind = "Auto" | "Ultimate" | "Active" | "Passive";

export interface HeroSkill {
  kind: SkillKind;
  name: string;
  /** Cooldown as shown in game, e.g. "6.4s". Auto attacks and passives have none. */
  cooldown?: string;
  effect: string;
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
  /** Known max stats. UR heroes fall back to the shared UR ceiling. */
  maxStats?: HeroMaxStats;
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

/** Max values at Lv150 / 10★. Every UR hero shares the same ceiling. */
export const heroStats: HeroMaxStats = { attack: "15,971", hp: "2,236,301", defense: "15,971", command: "350" };

export function getMaxStats(hero: Hero): HeroMaxStats | undefined {
  return hero.maxStats ?? (hero.rarity === "UR" ? heroStats : undefined);
}

/** UR heroes get Tenacity appended automatically; SSR/SR list theirs in `skills` when known. */
export function getSkills(hero: Hero): HeroSkill[] {
  return hero.rarity === "UR" ? [...hero.skills, tenacity] : hero.skills;
}

export const rarityOrder: HeroRarity[] = ["UR", "SSR", "SR"];

/** Every UR hero unlocks this sixth skill at Lv30 / 8★. */
export const tenacity: HeroSkill = {
  kind: "Passive",
  name: "Tenacity",
  effect: "+20% ATK, HP and DEF, and +10% cooldown speed. Unlocks at Lv30 / 8★ and is identical on every UR hero.",
};

export const heroes: Hero[] = [
  {
    slug: "arthur",
    name: "Arthur",
    rarity: "UR",
    faction: "Warrior",
    role: "Tank",
    tier: "S-Tier",
    image: "/images/heroes/arthur.webp",
    summary: "The starter tank everyone gets first, and still one of the best frontline anchors in the game.",
    unlock: "Day 1 from the Tavern. He's the only UR tank in the standard pool from the start, and his shards also come from the Alliance Shop and event rewards.",
    skills: [
      { kind: "Auto", name: "Battle Shield", effect: "750% ATK Physical damage to 1 target." },
      { kind: "Ultimate", name: "Earthshattering", cooldown: "6.4s", effect: "1,407.5% ATK Physical AoE damage, plus a squad-wide damage-reduction aura of 32.5%–40%." },
      { kind: "Active", name: "Rock Solid", cooldown: "4.5s", effect: "Shields himself for 25% of max HP, absorbing 50% of incoming damage." },
      { kind: "Passive", name: "Strong Will", effect: "Allied Tanks take 8.25% less damage." },
    ],
    overview: [
      "Arthur is the hero you build before any other hero exists. He shows up on day one, he's free, and he doesn't fall off. His job is simple: stand in front, take the hits, and make everyone behind him harder to kill.",
      "Earthshattering is what makes him special. It's a big AoE hit, but the real value is the damage-reduction aura it drops on the whole squad. Rock Solid keeps him alive between ultimates, and Strong Will quietly makes every other tank in the lineup tougher too, so he plays well next to a second tank rather than competing with one.",
      "He's equally at home in PvE grinding (Rat Swarm waves, Rat King, territory reclamation) and in PvP, which is why nearly every guide puts him at the top of the tank list.",
    ],
    investment: "Get him to 8★ for Tenacity — that's his biggest single stat jump. Most guides suggest having him at 5–6★ before you start pouring shards into Marlena.",
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
    summary: "A tank who shreds enemy DEF and drains their Energy damage while still dealing real damage of his own.",
    unlock: "Hero Pass and top-up/premium packs at first, then added to the Tavern on Day 66.",
    skills: [
      { kind: "Auto", name: "Smoke Cartridge", effect: "Throws 3 smoke bombs at random, 210% ATK Physical damage each (scales up by +200% by 10★)." },
      { kind: "Ultimate", name: "Shadow Hunt", cooldown: "6.4s", effect: "Rolling black mist dealing 922.5% ATK Physical AoE damage, and reduces enemy Energy damage by 40.2% for 5s." },
      { kind: "Active", name: "Shadow Strike", cooldown: "4.5s", effect: "462.5% ATK Physical AoE damage, and reduces enemy DEF by 50.25% for 3s." },
      { kind: "Passive", name: "Shadow Veil", effect: "Takes 32% less Energy damage." },
    ],
    overview: [
      "Shadow doesn't tank like Arthur does. Instead of shielding the squad, he makes the enemy weaker. Shadow Strike cuts their DEF in half for a few seconds, which turns every carry behind him into a bigger threat, and Shadow Hunt drags the whole enemy line's Energy damage down by about 40%.",
      "That Energy reduction matters because most of the game's top carries — Marlena, Cynthia, Red Lady, Annie — deal Energy damage. Add his own passive Energy resistance and he's very hard for those carries to burn through.",
      "He also hits harder than a tank has any right to. His smoke bombs and both AoE skills mean he's contributing damage the entire fight, not just soaking it.",
    ],
    investment: "For free-to-play players he joins the Tavern on Day 66 alongside Marlena, Cynthia, Annie, Joker and Harper. When you're spending UR Omni shards, the usual order is Marlena first, then Harper, then Cynthia, then Shadow.",
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
    summary: "A self-healing tank who shields the entire squad and gives every allied tank a head start.",
    unlock: "Hero Pass and Daily Offers, starting around server day 29.",
    skills: [
      { kind: "Auto", name: "Battle Will", effect: "622.5% ATK Physical damage to 1 target." },
      { kind: "Ultimate", name: "Bloodshed Defense", cooldown: "5.8s", effect: "Shields every ally for 570% of max DEF, absorbing 50% of damage for 5s." },
      { kind: "Active", name: "Deadly Pierce", cooldown: "4.5s", effect: "770% ATK Physical damage, and heals himself for 400% ATK." },
      { kind: "Passive", name: "Resolute Fight", effect: "At the start of battle, all allied Tanks get a shield worth 18.75% of max HP, absorbing 50% of damage for 5s." },
    ],
    overview: [
      "Daskal is all about survival. He heals himself with Deadly Pierce, throws shields on the whole team with Bloodshed Defense on one of the shortest ultimate cooldowns in the game, and opens every fight by shielding every tank you're running.",
      "That makes him at his best in PvP and longer battles, where the opening burst is what kills squads. His raw stat contribution is less impressive in PvE, so he's more of a war tank than a farming one.",
    ],
    investment: "Light spenders should take him to 8★ — that's where Tenacity unlocks and it's his biggest jump. Whales can push to 10★ for bigger shields and healing, but it isn't essential unless you're heavily invested in PvP.",
    squadFit: "His shields are what buy time in BF2's full-roster squad, sitting next to Shadow in front of Harper, Marlena and Cynthia. Resolute Fight is wasted with only one tank, so run him alongside Arthur, Shadow or another tank.",
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
    summary: "A puppet-master tank who protects your carries from stuns and Energy burst instead of just soaking damage.",
    unlock: "Hero Pass, around server day 85.",
    skills: [
      { kind: "Auto", name: "Wooden Frame", effect: "622.5% ATK Physical damage to 1 target." },
      { kind: "Ultimate", name: "Truth and Lies", cooldown: "6.4s", effect: "2,430% ATK AoE damage, and gives your 3 highest-ATK allies up to a 70% chance to resist stuns." },
      { kind: "Active", name: "Fate's Thread", cooldown: "4.5s", effect: "515% ATK Physical damage, and reduces Energy damage taken by your 2 highest-ATK allies by up to 33%." },
      { kind: "Passive", name: "Puppet", effect: "Takes 22% less damage." },
    ],
    overview: [
      "Billy is a defensive tank with a utility twist. He's tough on his own thanks to Puppet, but where he earns his slot is in how he protects your damage dealers — your highest-ATK heroes get stun resistance from his ultimate and an Energy-damage shield from Fate's Thread.",
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
    summary: "A wolf-blooded tank who punishes anyone who hits him by reflecting their damage straight back.",
    unlock: "Hero Pass and rotating Daily Offer packs.",
    skills: [
      { kind: "Auto", name: "Sharp Claw", effect: "622.5% ATK Physical damage to 1 target." },
      { kind: "Ultimate", name: "Throat Bite", cooldown: "6.4s", effect: "1,505% ATK Physical damage, and reduces damage taken by all allies by up to 18.75% for 4s." },
      { kind: "Active", name: "Lunar Howl", cooldown: "4.5s", effect: "Enters a Berserk state for 3s, reflecting 147% of incoming damage back to the attacker." },
      { kind: "Passive", name: "Wolf Bloodline", effect: "Takes 22% less damage." },
    ],
    overview: [
      "Ulfrid is a counter-puncher. Instead of relying on his own damage, he makes the enemy pay for focusing him — during Lunar Howl, every hit he takes comes back at 147%. Combine that with Wolf Bloodline's damage reduction and his ultimate's team-wide damage reduction, and he's genuinely annoying to kill.",
      "The catch is timing. His big value lives inside a 3-second window, so his impact is more situational and easier to play around than the top-tier tanks. That's why he sits a step below Arthur and Shadow rather than alongside them.",
    ],
    investment: "Light spenders can stop at 8★. Whales should push him to 10★.",
    squadFit: "He works best in sustained fights where the enemy is forced to attack through him. In a Warlock squad he stacks with Billy for a very durable front line, and Nicole's attack-speed passive helps him too.",
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
    summary: "A chain-whip tank built on damage reduction, self-healing, and refusing to die at the worst moment.",
    unlock: "Hero Pass and Daily Offers, starting around server day 64.",
    skills: [
      { kind: "Auto", name: "Shackles", effect: "622.5% ATK Physical damage to 1 target." },
      { kind: "Ultimate", name: "Cross Whip", cooldown: "6.4s", effect: "Swings 2 chains for 1,140% ATK damage to enemies in range, heals himself for 150% ATK, and reduces all allies' damage taken by up to 26.25% for 5s." },
      { kind: "Active", name: "Force Link", cooldown: "4.5s", effect: "Reduces Energy damage taken by your 2 highest-DEF allies by up to 27.75% for 4s." },
      { kind: "Passive", name: "Indomitable Spirit", effect: "Takes 26.25% less damage. Once per battle, a fatal hit leaves him at 1 HP in an undying state for 2s." },
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
    summary: "The highest damage ceiling in the game, and the best-value hero you can buy.",
    unlock: "Day 1 through First Top Up, Top Up Bonus rewards and Daily Offers — roughly a $1 pack, which makes her the best-value hero in the game. Later added to the Tavern on Day 66.",
    skills: [
      { kind: "Auto", name: "Skybreaker Slash", effect: "652.5% ATK Energy damage to 1 target." },
      { kind: "Ultimate", name: "Peerless Blade", cooldown: "13.6s", effect: "3 sword winds at random targets for 2,818.75% ATK Energy damage in total." },
      { kind: "Active", name: "Crimson Bloom", cooldown: "4.5s", effect: "1,218.75% ATK Energy AoE damage, and buffs her own ATK by 12% for 3s." },
      { kind: "Passive", name: "War God's Will", effect: "Deals 22% more Energy damage." },
    ],
    overview: [
      "Marlena has the single highest damage ceiling of any hero, and the reason is how her kit stacks. Crimson Bloom buffs her own ATK, War God's Will buffs her Energy damage, and Tenacity adds more ATK on top. Those multiply together, so her damage compounds instead of just adding up.",
      "She's also cheap to get and available from day one, which is why almost every guide agrees she should be the first place your UR Omni shards go.",
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
    summary: "Marlena's crit-based cousin — huge dagger hits that scale differently into the late game.",
    unlock: "Hero Pass and Daily Offers, starting around server day 57.",
    skills: [
      { kind: "Auto", name: "Dagger", effect: "622.5% ATK Energy damage to 1 target." },
      { kind: "Ultimate", name: "Forest Hunter", cooldown: "13.6s", effect: "Tosses 3 special daggers at random enemies for 3,058% ATK damage each." },
      { kind: "Active", name: "Mountain God Wrath", cooldown: "4.5s", effect: "A whirlwind of green leaves dealing 525% ATK Energy damage per second for 3s, and enemies hit take 20% more Energy damage." },
      { kind: "Passive", name: "Lady of the Forest", effect: "+22% Crit Rate." },
    ],
    overview: [
      "Zoya's kit is built very much like Marlena's, but where Marlena's passive boosts Energy damage, Zoya's boosts Crit Rate. That means she scales differently as the game goes on and gear and buffs start stacking.",
      "Mountain God Wrath does double duty: it's steady damage over three seconds, and it makes everything it touches take more Energy damage from the rest of your squad. Forest Hunter's three daggers each hit for over 3,000% ATK.",
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
    summary: "A moon-blade Energy carry with heavy single-target hits and a Crit buff that grows with every star.",
    unlock: "Wishing Wheel event (shards at about a 10% chance per spin, with rarer 2- and 5-shard drops), VIP shop and badge exchanges. She also appears in early Daily Offers and joins the Tavern on Day 66.",
    skills: [
      { kind: "Auto", name: "Moon Blade", effect: "622.5% ATK Energy damage to 1 target." },
      { kind: "Ultimate", name: "Moonfall Dance", cooldown: "13.6s", effect: "2,480% ATK Energy damage, and a 14% Crit Rate buff." },
      { kind: "Active", name: "Lunar Hunt", cooldown: "4.5s", effect: "Locks onto 3 random targets for 1,500% ATK Energy damage per blade." },
      { kind: "Passive", name: "Moon's Blessing", effect: "+22% Crit Rate." },
    ],
    overview: [
      "Cynthia is a strong Energy damage dealer who also buffs her own crits. Lunar Hunt is the workhorse — three locked-on blades at 1,500% ATK each, every 4.5 seconds — and Moonfall Dance lets her hit multiple enemies while stacking more Crit Rate on top of her passive.",
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
    summary: "A burst carry who targets the enemy's biggest hitters, amplifies their damage taken, and stuns them.",
    unlock: "Hero Pass and Daily Offers, starting around server day 36.",
    skills: [
      { kind: "Auto", name: "Blood Blade", effect: "622.5% ATK Energy damage to 1 target." },
      { kind: "Ultimate", name: "Crimson Rose", cooldown: "13.6s", effect: "3,792% ATK Energy damage to the 2 highest-ATK enemies, with a 35% chance to stun them for 5s." },
      { kind: "Active", name: "Bloodthirsty Slaughter", cooldown: "4.5s", effect: "Locks a target for 2,445% ATK Energy damage, and increases their damage taken by 14% for 3s." },
      { kind: "Passive", name: "Lone Flower", effect: "+22% Crit Rate." },
    ],
    overview: [
      "Red Lady is one of the most consistent damage dealers in the game, in both PvE and PvP. Her kit is built to find the targets that matter: Crimson Rose goes straight for the enemy's two highest-ATK heroes, and a 5-second stun on a carry can decide a fight.",
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
    summary: "An AoE Burn specialist who clears waves and keeps chipping damage long after she's attacked.",
    unlock: "Hero Pass around server day 15, then Daily Offers. Added to the Tavern on Day 66.",
    skills: [
      { kind: "Auto", name: "Candy", effect: "Waves a magic wand for 622.5% ATK Energy damage to 1 target." },
      { kind: "Ultimate", name: "Candy Jar", cooldown: "13.6s", effect: "2 explosive jars on the 2 highest-ATK enemies for 2,981% ATK Energy damage, plus Burn (100% ATK per second for 5s)." },
      { kind: "Active", name: "Surprise Gift", cooldown: "4.1s", effect: "1,342.5% ATK Energy AoE damage, plus Burn." },
      { kind: "Passive", name: "Charged Gummies", effect: "Deals 22% more Energy damage." },
    ],
    overview: [
      "Annie is about consistency rather than burst. Both her big skills hit wide and leave Burn behind, so enemies keep taking damage after the hit lands. Surprise Gift also has a faster cooldown than most actives at 4.1 seconds.",
      "That makes her a reliable PvE damage dealer who clears waves efficiently. She still works in PvP, but her damage there is lower than the top burst carries.",
    ],
    investment: "7–8★ is plenty if most of your investment is going into PvP. If you're PvE-focused, 9–10★ is where she really pays off.",
    squadFit: "Her Burn is what makes Nicole hit harder — Inferno Array does 40% bonus damage to Burning targets — so the two are a natural pair. Joker's Burn stacks into the same plan in a Warlock squad.",
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
    summary: "A card-throwing executioner who goes straight for the lowest-HP enemies and finishes them.",
    unlock: "Wishing Wheel and Daily Offers once a server is roughly two weeks old. Added to the Tavern on Day 66.",
    skills: [
      { kind: "Auto", name: "Deal Cards", effect: "Throws a card for 622.5% ATK Physical damage to the lowest-HP enemy." },
      { kind: "Ultimate", name: "Joker Ace", cooldown: "13.6s", effect: "2 cards at the 2 lowest-HP enemies for 4,206.25% ATK Physical damage." },
      { kind: "Active", name: "Hearthunt Red Card", cooldown: "4.5s", effect: "1,350% ATK Physical damage to 2 random targets, plus Burn (400% ATK per second for 3s at max rank)." },
      { kind: "Passive", name: "Frenzied Emotion", effect: "+22% Crit Rate." },
    ],
    overview: [
      "Joker is a finisher. His auto attack and his ultimate both aim for the enemies with the least HP left, and Joker Ace hits for over 4,200% ATK — enough to delete a hero that's already been softened up.",
      "He's at his strongest early to mid game, where that burst can end fights quickly. He's good in PvP too, but he's star-dependent. He's also the only UR carry who deals Physical damage, which matters when the enemy is stacking Energy resistance (Shadow, Billy, Louis).",
    ],
    investment: "He's star-dependent, so a half-built Joker underperforms. 8★ for Tenacity is the first target before deciding whether to go further.",
    squadFit: "His Burn sets up Nicole's bonus damage against Burning targets, and he pairs naturally with Annie in a Warlock squad. His Physical damage is a good counter to Energy-resistant lineups.",
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
    summary: "The best offensive support in the game — a repeating ATK buff for the whole squad, and more for Warriors.",
    unlock: "Day 22, through Daily Offers. Later added to the Tavern on Day 66.",
    skills: [
      { kind: "Auto", name: "Bubble", effect: "622.5% ATK Energy damage to 1 target." },
      { kind: "Ultimate", name: "War Flute Sound", cooldown: "12.7s", effect: "+26.295% ATK to all allies for 5s." },
      { kind: "Active", name: "Vitality Bubble", cooldown: "4.55s", effect: "Reduces your lowest-HP ally's damage taken by 18% for 4s." },
      { kind: "Passive", name: "Warrior's Anthem", effect: "+16.5% ATK to all allied Warriors." },
    ],
    overview: [
      "Harper doesn't do much damage himself — he makes everyone else do more. War Flute Sound buffs the whole squad's ATK by over 26% on a repeating window, and Warrior's Anthem adds another 16.5% to every Warrior on the team permanently. Those two stack.",
      "Vitality Bubble is the small extra that keeps your weakest hero alive a little longer. Put together, he's the best offensive support in the game.",
    ],
    investment: "He's second in line for UR Omni shards after Marlena. Get him to 8★ for Tenacity, which also shortens the gap between his ATK buffs.",
    squadFit: "He's best with as many Warriors as you can field — Arthur, Daskal, Marlena and Zoya all get his passive. He's the support in BF2's full-roster squad. Until he unlocks on Day 22, Celia or Stellar can hold the support slot.",
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
    summary: "The Ranger mirror of Harper — buffs your two hardest hitters directly and heals your weakest ally.",
    unlock: "Hero Pass and Daily Offers, starting around server day 71.",
    skills: [
      { kind: "Auto", name: "Musical Note", effect: "Waves a bell for 622.5% ATK Physical damage to 1 target." },
      { kind: "Ultimate", name: "Inspiration", cooldown: "12.7s", effect: "+48.75% ATK to your 2 highest-ATK allies for 5s." },
      { kind: "Active", name: "Healing Sound", cooldown: "4.5s", effect: "Heals your lowest-HP ally for 450% ATK." },
      { kind: "Passive", name: "Battle Anthem", effect: "+16.5% ATK to all allied Rangers." },
    ],
    overview: [
      "Bell does for Rangers what Harper does for Warriors. Battle Anthem gives every Ranger on the team +16.5% ATK, and Inspiration hands your two highest-ATK heroes a massive +48.75% ATK — a narrower buff than Harper's, but much stronger on the heroes that matter.",
      "Healing Sound gives her something Harper doesn't have: a real heal every 4.5 seconds on whoever is closest to dying.",
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
    summary: "A dedicated healer with an offensive edge — her ultimate hits much harder against Burning enemies.",
    unlock: "Hero Pass, around server day 99.",
    skills: [
      { kind: "Auto", name: "Ember Dust", effect: "622.5% ATK Physical damage to 1 target, and heals the lowest-HP ally for 50% ATK." },
      { kind: "Ultimate", name: "Inferno Array", cooldown: "13.6s", effect: "2,625% ATK Physical AoE damage, with 40% bonus damage against Burning targets." },
      { kind: "Active", name: "Heartwarming Flame", cooldown: "4.55s", effect: "Heals your 2 lowest-HP allies for 387.5% ATK." },
      { kind: "Passive", name: "Flame Soul Power", effect: "+13.5% attack speed to all allied Warlocks." },
    ],
    overview: [
      "Nicole is the game's most dedicated healer. Every auto attack heals someone, and Heartwarming Flame heals your two weakest heroes every few seconds. But she isn't just a healer — Inferno Array is a big AoE hit that gets a 40% bonus against anything already Burning.",
      "Her passive is the reason she belongs in a Warlock squad specifically. +13.5% attack speed only helps Warlocks, so she's at her best when most of the lineup shares her faction.",
    ],
    investment: "There's no specific star target in our notes yet. 8★ for Tenacity is the first milestone; push further if she's a fixed part of your Warlock squad.",
    squadFit: "She pairs especially well with Annie and Joker, whose Burns set up her ultimate's bonus damage. Fill the front with Billy or Ulfrid to keep the Warlock attack-speed bonus on every slot.",
    pairsWith: ["annie", "joker", "billy", "ulfrid"],
  },

  // ───────────────────────── SSR heroes ─────────────────────────
  {
    slug: "bella",
    name: "Bella",
    rarity: "SSR",
    faction: "Warrior",
    role: "Tank",
    maxStats: { attack: "15,973", hp: "2,236,303", defense: "15,973", command: "350" },
    summary: "A free axe-wielding tank who shrugs off monster damage — the go-to stand-in until your UR tanks are built.",
    unlock: "Free from Exploration and the Tavern. Her shards are also sold in the Alliance Shop.",
    skills: [
      { kind: "Auto", name: "Swing", effect: "Wields a giant axe for 429% ATK Physical damage to 1 target." },
      { kind: "Ultimate", name: "Bloody Requiem", cooldown: "7.0s", effect: "Dual axes for 2,405.7% ATK damage to targets in range, and reduces their ATK by 6% for 5s." },
      { kind: "Active", name: "Crimson Prayer", cooldown: "5.0s", effect: "Takes 41.25% less damage from monsters for 3s." },
      { kind: "Passive", name: "Purity", effect: "Takes 22% less damage from monsters." },
    ],
    overview: [
      "Bella is built for PvE. Between her passive and Crimson Prayer she can cut monster damage by a huge amount, which lets her hold the front line through early-to-mid game farming far longer than her rarity suggests.",
      "Fully maxed, her stats land essentially level with a maxed UR. Where she falls behind is utility — her kit is all about monsters, so she has much less to offer in PvP.",
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
    summary: "A two-handed axe tank with a stun on his ultimate — the SSR tank most worth your SSR Omni shards.",
    unlock: "Hero Pass and the Tavern, which is where most of his shards come from.",
    skills: [
      { kind: "Auto", name: "Battle Axe", effect: "429% ATK Physical damage to 1 target." },
      { kind: "Ultimate", name: "Whirlwind Cut", cooldown: "7.0s", effect: "1,691% ATK Physical damage to 1 target in front, and stuns it for up to 1.5s." },
      { kind: "Active", name: "Decapitation", cooldown: "5.0s", effect: "Raises a great axe with both hands for 1,582% ATK Physical damage to 1 target." },
      { kind: "Passive", name: "God of War Blessing", effect: "Takes 22% less damage from monsters." },
    ],
    overview: [
      "Lucius is a solid, no-fuss tank that works for both free-to-play and paying players. He hits harder than Bella on single targets, and Whirlwind Cut's stun gives him a little control that most SSR tanks don't have.",
      "His passive is monster-focused like Bella's, so he's strongest in PvE, but the stun keeps him relevant in early PvP too.",
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
    summary: "A serpent-flute hybrid who sits awkwardly between tank and damage dealer.",
    unlock: "Tavern and Hero Summon.",
    skills: [
      { kind: "Auto", name: "Serpent Flute", effect: "462% ATK Physical damage to 1 target." },
      { kind: "Ultimate", name: "Serpent Veil", cooldown: "7.0s", effect: "Summons a spirit snake for 35.25% ATK Physical damage to 1 target." },
      { kind: "Active", name: "Venomous Bite", cooldown: "5.0s", effect: "1,919.5% ATK damage to 1 target." },
      { kind: "Passive", name: "Serpent Resonance", effect: "Takes 22% less damage from monsters." },
    ],
    overview: [
      "Griffith never fully commits to either role. Venomous Bite is a big single-target hit, but he lacks the protective tools of a real tank, and he doesn't scale like a dedicated carry either.",
      "He's not useless — the monster damage reduction keeps him alive in PvE — but he doesn't bring any real tank utility to a squad.",
    ],
    investment: "Only invest in him if you genuinely have nothing better for the slot. Shards are better spent on Lucius or Bella.",
    squadFit: "He's a Ranger, so he can fill a gap in a Ranger-leaning squad early on, but expect to replace him with Shadow or Louis.",
    pairsWith: ["ash", "bestar"],
  },
  {
    slug: "hastar",
    name: "Hastar",
    rarity: "SSR",
    faction: "Warlock",
    role: "Tank",
    summary: "A tentacled Warlock tank who stuns, hits hard, and shields himself when things get desperate.",
    unlock: "Tavern and Hero Summon.",
    skills: [
      { kind: "Auto", name: "Lash", effect: "Lashes an enemy with tentacles for 445.5% ATK Energy damage to 1 target." },
      { kind: "Ultimate", name: "Wrath of Old Gods", cooldown: "7.0s", effect: "3,019.5% ATK Physical damage to enemies in front." },
      { kind: "Active", name: "Undercurrent", cooldown: "5.0s", effect: "1,089% ATK Energy damage to 1 target, and stuns it for 1s." },
      { kind: "Passive", name: "Scorn Guard", effect: "Once per battle, dropping below 40% HP gives him a shield worth 13.5% of max HP that absorbs 50% of damage for 5s." },
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
    summary: "One of the best SSR carries — high burst, steady output, and a monster-damage buff for her fellow Warriors.",
    unlock: "Free from Forest Exploration, plus the Tavern and Hero Pass.",
    skills: [
      { kind: "Auto", name: "Holy Banner", effect: "Swings a flag for 495% ATK Physical damage to 1 target." },
      { kind: "Ultimate", name: "Celestial Judgement", cooldown: "8.0s", effect: "A giant holy sword for 1,888.575% ATK Physical damage to enemies in range." },
      { kind: "Active", name: "Rain of Arrows", cooldown: "5.0s", effect: "5 rapid hits for 506% ATK Physical damage each." },
      { kind: "Passive", name: "Call of the Brave", effect: "The 3 highest-ATK Warriors on your team deal 22% more damage to monsters." },
    ],
    overview: [
      "Claire is the SSR carry most players should build. Rain of Arrows lands five hits every five seconds, Celestial Judgement adds a big area hit, and her passive makes your three strongest Warriors hit monsters 22% harder.",
      "She performs reliably in both PvE and PvP, and with proper investment she pulls well ahead of Celia.",
    ],
    investment: "Worth investing SSR Omni shards into. She's free from Forest Exploration, so she's easy to start on.",
    squadFit: "She's at her best on a Warrior-heavy team, where her passive boosts Arthur, Marlena and your other Warriors against monsters. A strong second carry next to Marlena early on.",
    pairsWith: ["marlena", "arthur", "harper", "lucius"],
  },
  {
    slug: "kesso",
    name: "Kesso",
    rarity: "SSR",
    faction: "Warrior",
    role: "Carry",
    summary: "A spear-thrower with a war-eagle summon and a clutch ATK spike when he's about to go down.",
    unlock: "Tavern and Hero Summon. His shards are hard to come by.",
    skills: [
      { kind: "Auto", name: "Spear Throw", effect: "495% ATK Physical damage to 1 target." },
      { kind: "Ultimate", name: "Summon Warhawk", cooldown: "9.0s", effect: "Summons a war eagle for 10s that attacks with 450% of Kesso's ATK plus 25% of his HP." },
      { kind: "Active", name: "Hunting Skills", cooldown: "5.0s", effect: "Throws 2 spears at random enemies for 1,252.5% ATK Physical damage each." },
      { kind: "Passive", name: "Wild Survival", effect: "The first time his HP drops below 30%, he gains +51% ATK for 5s." },
    ],
    overview: [
      "Kesso is good in both PvP and PvE. His Warhawk scales off his HP as well as his ATK, and Hunting Skills keeps two spears flying every five seconds.",
      "Wild Survival is the fun part: the first time he gets low, he spikes his ATK by 51%. Timed well, that turns a losing exchange into a win.",
    ],
    investment: "His shards are hard to obtain, so make him your fourth or fifth SSR to star up rather than an early priority.",
    squadFit: "A Warrior carry, so Harper's passive and Claire's monster buff both apply to him.",
    pairsWith: ["claire", "harper", "marlena"],
  },
  {
    slug: "sivir",
    name: "Sivir",
    rarity: "SSR",
    faction: "Warrior",
    role: "Carry",
    summary: "A broken-spear fighter with a flat ATK passive — a straightforward all-round PvP carry.",
    unlock: "Tavern and Hero Summon.",
    skills: [
      { kind: "Auto", name: "Hunt", effect: "Throws a broken spear for 412.5% ATK Physical damage to 1 target." },
      { kind: "Ultimate", name: "Wild Pursuit", cooldown: "8.0s", effect: "2 broken spears at random enemies for 1,252.5% ATK Physical damage each." },
      { kind: "Active", name: "Shield Strike", cooldown: "5.0s", effect: "Throws a shield for 1,573% ATK Physical damage to 1 target." },
      { kind: "Passive", name: "Hunter Bloodline", effect: "+22% ATK in combat." },
    ],
    overview: [
      "Sivir is an all-around PvP carry. Hunter Bloodline is a flat 22% ATK boost that works everywhere, not just against monsters, which is what makes Sivir better suited to player fights than the PvE-focused SSR carries.",
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
    summary: "A reliable single-target archer who shines in PvE and boss fights, and buffs your top Rangers against monsters.",
    unlock: "Free from Exploration, plus the Tavern and Hero Summon.",
    skills: [
      { kind: "Auto", name: "Precision Shot", effect: "429% ATK Physical damage to 1 target." },
      { kind: "Ultimate", name: "Eagle Spirit Hunt", cooldown: "8.0s", effect: "2,332% ATK Physical damage to 1 target." },
      { kind: "Active", name: "One Stone Two Birds", cooldown: "5.0s", effect: "2 arrows at random targets for 1,320% ATK Physical damage each." },
      { kind: "Passive", name: "Focus", effect: "The 2 highest-ATK Rangers on your team deal 30% more damage to monsters." },
    ],
    overview: [
      "Ash is easy to get and scales well, which makes her a great early-to-mid game investment. She's built for eliminating priority targets and handles boss fights especially well.",
      "Her passive update made her very useful in PvE — your two strongest Rangers hit monsters 30% harder. The weakness is a lack of AoE and utility, so she can struggle in PvP-heavy content.",
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
    summary: "A Bleed specialist with ghostly cat attacks who gets stronger the longer the fight goes.",
    unlock: "Tavern and Hero Summon.",
    skills: [
      { kind: "Auto", name: "Cat Bell", effect: "429% ATK Physical damage to 1 target." },
      { kind: "Ultimate", name: "Sacred Flame Kitty", cooldown: "8.0s", effect: "Cat ghosts for 1,646.7% ATK Physical AoE damage, plus Bleed." },
      { kind: "Active", name: "Black Cat Messenger", cooldown: "5.0s", effect: "726% ATK Physical damage to 1 target, plus Bleed." },
      { kind: "Passive", name: "Bloodstain Tracker", effect: "Deals 41.25% more damage to Bleeding enemies." },
    ],
    overview: [
      "Bestar shreds enemies over time. Both of her skills apply Bleed, and her passive adds over 41% damage against anything that's Bleeding — so once she gets going, everything she hits takes much more.",
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
    summary: "A spell-slinging Warlock with heavy single-target burst and bonus damage against monsters.",
    unlock: "Free from Exploration and the Tavern, plus Hero Summon.",
    skills: [
      { kind: "Auto", name: "Cast Spell", effect: "Waves the wand for 379.5% ATK Energy damage to 1 target." },
      { kind: "Ultimate", name: "Soul Capture Spell", cooldown: "9.0s", effect: "1,703.875% ATK Energy AoE damage to all targets in range, and increases his own ATK by 7.5% for 7s." },
      { kind: "Active", name: "Heartbreaker Spell", cooldown: "5.0s", effect: "1,534.5% ATK Energy damage to 1 target." },
      { kind: "Passive", name: "Exorcism Spell", effect: "Deals 27.5% more damage to monsters." },
    ],
    overview: [
      "Grenwald specializes in high single-target burst and is especially effective in PvE, where his passive adds 27.5% damage against monsters.",
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
    summary: "A dagger-throwing PvE support who boosts monster damage and resource gains from monster kills.",
    unlock: "Free from the Tavern — collect 5 antidotes to heal her and she joins you.",
    skills: [
      { kind: "Auto", name: "Flying Blade", effect: "Throws a dagger for 247.5% ATK Physical damage to 1 target." },
      { kind: "Ultimate", name: "Ricochet Blade", cooldown: "9.0s", effect: "A dagger that ricochets 3 times for 1,630.2% ATK Physical damage to 3 random targets." },
      { kind: "Active", name: "Deadly Lotus", cooldown: "5.0s", effect: "2 daggers for 1,122% ATK Physical damage to 2 random targets." },
      { kind: "Passive", name: "Ultimate Hunt", effect: "Deals 16.5% more damage to monsters, and your squad gets +55% resources from Resource and Elite monster kills." },
    ],
    overview: [
      "Celia is really a PvE hybrid. Her damage comes in random bursts, and her passive is the reason to run her: +55% resources from Resource and Elite monster kills is a big boost to your farming.",
      "Her reliance on random targeting and her weaker scaling make her less reliable long-term than a dedicated carry like Claire.",
    ],
    investment: "She's free, so she's worth using early, but don't sink heavy investment into her.",
    squadFit: "Holds the support slot until Harper unlocks on Day 22, and stays useful in a farming squad for the resource bonus.",
    pairsWith: ["arthur", "claire", "bella"],
  },
  {
    slug: "stellar",
    name: "Stellar",
    rarity: "SSR",
    faction: "Warlock",
    role: "Support",
    summary: "A star-themed support with real damage, a big monster-damage buff for allies, and a clutch heal on death.",
    unlock: "Tavern and Hero Summon.",
    skills: [
      { kind: "Auto", name: "Meteorite", effect: "Launches stardust for 495% ATK Physical damage to 1 target." },
      { kind: "Ultimate", name: "Wishing Star", cooldown: "7.0s", effect: "A meteor shower that gives allies in range +53.2% damage to monsters for 5s." },
      { kind: "Active", name: "Destructive Comet", cooldown: "5.0s", effect: "1,608.75% ATK AoE damage, and monsters hit take 8% more damage for 3s." },
      { kind: "Passive", name: "Final Starling", effect: "Once per battle, on taking fatal damage, heals the lowest-HP ally for 1,100% ATK." },
    ],
    overview: [
      "Stellar is an SSR support with real offensive teeth. Destructive Comet is a big AoE hit, and Wishing Star gives nearby allies over 53% more damage against monsters, which makes her excellent in PvE.",
      "Final Starling gives her unique clutch value — even when she goes down, she throws a huge heal onto your weakest hero.",
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
    summary: "A low-tier greatsword tank who's still handy for defending your territory early on.",
    unlock: "Free from Exploration and the Tavern.",
    skills: [
      { kind: "Auto", name: "Slash", effect: "315% ATK Physical damage to 1 target." },
      { kind: "Ultimate", name: "Blade Fury", cooldown: "7.0s", effect: "Swings a greatsword twice for 1,224% ATK Physical damage to enemies in front." },
      { kind: "Active", name: "Leap Slash", cooldown: "5.0s", effect: "1,057.5% ATK Physical damage to 1 target." },
      { kind: "Passive", name: "Tenacity", effect: "+5% ATK, HP and DEF (the SR version)." },
    ],
    overview: [
      "Durant isn't really good for dedicated PvE or PvP content, but he has one job he does fine: defending your territory while you're still short on high-star tanks.",
    ],
    investment: "Put all your SR shards into him — he's the SR hero worth having.",
    squadFit: "Slot him 3rd or 4th in your lineup (4th if you have a monthly pass) for territory defense until better tanks replace him.",
    pairsWith: ["arthur", "bella"],
  },
  {
    slug: "william",
    name: "William",
    rarity: "SR",
    faction: "Warrior",
    role: "Carry",
    summary: "A bench-tier swordsman. Fine to own, not worth building.",
    unlock: "Free — his shards come from the Tavern.",
    skills: [
      { kind: "Auto", name: "Sword Gale", effect: "73.5% ATK Physical damage to 1 target." },
      { kind: "Ultimate", name: "Whirlwind Blade", cooldown: "10.0s", effect: "259.35% ATK Physical damage to enemies in range." },
      { kind: "Active", name: "Twin Wind", cooldown: "5.0s", effect: "2 sword-wind hits for 30% ATK Physical damage each." },
    ],
    overview: [
      "William is a low-tier bench carry. His numbers are very low compared to every other carry, and even the community's best read on him is that his max skills are unclear and he isn't really useful.",
    ],
    investment: "Don't invest in him.",
    squadFit: "Bench only — any SSR carry is a better use of the slot.",
    pairsWith: [],
  },
  {
    slug: "robin",
    name: "Robin",
    rarity: "SR",
    faction: "Ranger",
    role: "Carry",
    summary: "A bench-tier archer whose rapid fire can't keep up with the real Ranger carries.",
    unlock: "A bench hero — not worth chasing.",
    skills: [
      { kind: "Auto", name: "Aim", effect: "Shoots a wooden arrow for 278% ATK Physical damage to 1 target." },
      { kind: "Ultimate", name: "Rapid Fire", cooldown: "10.0s", effect: "7 rapid shots for 281% ATK Physical damage each." },
      { kind: "Active", name: "Arrow of Retribution", cooldown: "5.0s", effect: "936% ATK Physical damage to 1 target." },
    ],
    overview: [
      "Robin's damage is low compared to the other Ranger carries, and he isn't useful for dedicated PvE or PvP content.",
    ],
    investment: "Don't invest in him.",
    squadFit: "Bench only — Ash or Bestar are much better early Ranger carries.",
    pairsWith: [],
  },
  {
    slug: "kafa",
    name: "Kafa",
    rarity: "SR",
    faction: "Warlock",
    role: "Carry",
    summary: "A coffee-throwing bench hero — charming, but too weak to field.",
    unlock: "A bench hero — not worth chasing.",
    skills: [
      { kind: "Auto", name: "Coffee", effect: "Throws a coffee bean for 297% ATK Physical damage to 1 target." },
      { kind: "Ultimate", name: "Love Infusion", cooldown: "10.0s", effect: "2 coffee pots for 1,220.4% ATK Physical damage to enemies in range." },
      { kind: "Active", name: "Double Expresso", cooldown: "5.0s", effect: "Throws a cup of coffee for 900% ATK Physical damage to 1 target." },
    ],
    overview: [
      "Kafa is one of the benched heroes. As an SR with low damage, Kafa isn't useful in either PvE or PvP.",
    ],
    investment: "Not worth investing in.",
    squadFit: "Bench only — Grenwald is the early Warlock carry to use instead.",
    pairsWith: [],
  },
];

export function getHero(slug: string) { return heroes.find((hero) => hero.slug === slug); }
