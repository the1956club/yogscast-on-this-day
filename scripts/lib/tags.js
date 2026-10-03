// Title-based tagging for the Custom Filter page's "Filter by game" and
// "Filter by series" pickers. Applied every time videos-by-day.json is
// rebuilt (see buildByDayIndex in dataset.js), so new uploads picked up by
// the daily Action get tagged automatically.
//
// Everything is matched case-insensitively against the full video title.
//
// Hand fixes: scripts/tag-overrides.json maps a videoId to the games and/or
// series it should have, and wins over anything matched here. Edit that
// file (not videos-by-day.json, which gets regenerated) to correct a video.

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Games — one tag per video, first match wins, so more specific patterns are
// listed before the generic ones they'd otherwise be swallowed by (e.g.
// "Garry's Mod: TTT" before the bare "Garry's Mod"). No match = "Other".
// ---------------------------------------------------------------------------
const GAMES = [
  // --- Garry's Mod sub-modes (most specific first) ---
  ["Garry's Mod: TTT", [/g\s*mod\s*ttt/i]],
  ["Garry's Mod: Build", [/gmod\s*build/i]],
  ["Garry's Mod: Murder", [/g\s*mod\s*murder/i]],
  ["Garry's Mod: Prop Hunt", [/gmod\s*prop\s*hunt/i]],
  ["Garry's Mod: Pictionary", [/gmod\s*pictionary/i]],
  ["Garry's Mod: Hide and Seek", [/gmod\s*hide\s*and\s*seek/i]],
  ["Garry's Mod: Deathrun", [/gmod\s*deathrun/i]],
  ["Garry's Mod", [/\bgmod\b/i, /garry'?s\s*mod/i]],

  // --- Minecraft (very broad net; numbered snapshot versions too) ---
  ["Minecraft", [/minecraft/i, /\bmc\s*snapshot\b/i, /\b\d+w\d+[a-z]\b/i]],

  ["World of Warcraft", [/warcraft/i, /\bwow\b/i]],

  ["GTA 5", [/gta\s*5/i, /gta\s*v\b/i, /grand theft auto/i]],
  ["Red Dead Redemption", [/red dead/i]],

  ["Among Us", [/among us/i]],
  ["7 Days to Die", [/7\s*days\s*to\s*die/i, /days to die/i]],
  ["The Forest", [/\bthe forest\b/i]],
  ["Colony Survival", [/colony survival/i]],
  ["Dread Hunger", [/dread hunger/i]],
  ["Project Winter", [/project winter/i]],
  ["PUBG", [/playerunknown|\bpubg\b/i]],
  ["Borderlands", [/borderlands/i]],
  ["First Class Trouble", [/first class trouble/i]],
  ["Don't Starve", [/don'?t starve/i]],
  ["Guild Wars 2", [/guild wars/i]],
  ["Hearthstone", [/hearthstone/i]],
  ["Civilization", [/\bciv\s*5\b|civilization/i]],
  ["OneShot", [/\boneshot\b/i]],
  ["Block N Load", [/block n load/i]],
  ["Star Control 2", [/star control/i]],
  ["Deducto", [/\bdeducto\b/i]],
  ["Murder on Minecraft Express", [/murder on minecraft express/i]],
  ["Jingle Jam", [/jingle jam/i]],
  ["Pickaxe Week", [/pickaxe week/i]],
  ["Tiny Teams", [/tiny teams/i]],
  ["YogsQuest", [/yogsquest/i]],
  ["Perfect Heist 2", [/perfect heist/i]],
  ["Pumpkin Prince", [/pumpkin prince/i]],
  ["House of Hell", [/house of hell/i]],
  ["Sorcery 2", [/sorcery\s*2/i]],
  ["Landmark", [/\blandmark\b/i]],
  ["WildStar", [/wildstar/i]],
  ["Voltz", [/\bvoltz\b/i]],
  ["TUG", [/\btug\b/i]],
  ["Besiege", [/besiege/i]],
  ["Torchlight 2", [/torchlight/i]],
  ["Race for the Wool", [/race for the wool/i]],
  ["Team Fortress 2", [/team fortress 2|\btf2\b/i]],
  ["Goat Simulator", [/goat sim/i]],
  ["Dimension Jumper", [/dimension jumper/i]],
  ["Deep Rock Galactic", [/deep rock galactic/i]],
  ["Overcooked 2", [/overcooked\s*2/i]],
  ["Banana Katana", [/banana katana/i]],
  ["Soul Hunt", [/soul hunt/i]],
  ["Midnight Ghost Hunt", [/midnight ghost hunt/i]],
  ["Guns of Icarus", [/guns of icarus/i]],
  ["Golf With Your Friends", [/golf with your friends/i]],
  ["Sea of Thieves", [/sea of thieves/i]],
  ["GeoGuessr", [/geoguessr/i]],
  ["White Noise 2", [/white noise\s*2/i]],
  ["Magicite", [/\bmagicite\b/i]],
  ["Left 4 Dead 2", [/\bl4d2\b|left 4 dead/i]],
  ["Cube World", [/cube world/i]],
  ["Papers, Please", [/papers,?\s*please/i]],
  ["Terraria", [/\bterraria\b/i]],
  ["The Ship", [/\bthe ship remast/i]],
  ["Dead Space 3", [/dead space\s*3/i]],
  ["Chivalry: Medieval Warfare", [/\bchivalry\b/i]],
  ["Pandora: First Contact", [/pandora: first contact/i]],
  ["Total War: Warhammer", [/total war:? warhammer/i]],
  ["Witch It", [/\bwitch it\b/i]],
  ["EVE Online", [/\beve\b/i]],
  ["Shenmue", [/\bshenmue\b/i]],
  ["Hearts of Iron IV", [/hearts of iron/i]],
  ["Mirage: Arcane Warfare", [/mirage: arcane warfare/i]],
  ["Star Trek: Bridge Crew", [/star trek.*bridge crew/i]],
  ["R.E.P.O.", [/\br\.?e\.?p\.?o\.?\b/i]],
  ["Party Animals", [/party animals/i]],
  ["Monumental Failure", [/monumental failure/i]],
  ["Pulsar: Lost Colony", [/pulsar: lost colony/i]],
  ["Magic: The Gathering", [/magic:?\s*the gathering/i]],
  ["The Chameleon", [/\bthe chameleon\b/i]],
  ["Thronebreaker", [/\bthronebreaker\b/i]],
  ["Fortnite", [/\bfortnite\b/i]],
  ["Caveblazers", [/\bcaveblazers\b/i]],
  ["Sanctum", [/\bsanctum\b/i]],
  ["War of the Vikings", [/war of the vikings/i]],
  ["Worms", [/\bworms\b/i]],
  ["Nosgoth", [/\bnosgoth\b/i]],
  ["Surgeon Simulator", [/surgeon sim/i]],
  ["Deck Rippers", [/deck rippers/i]],
  ["Super Mario Maker", [/super mario maker/i]],
  ["Move or Die", [/move or die/i]],
  ["Herobrine's Return", [/herobrine'?s return/i]],
  ["Hatoful Boyfriend", [/hatoful boyfriend/i]],
  ["Heroes of Might & Magic", [/heroes of might/i]],
  ["Heroes of the Storm", [/heroes of the storm/i]],
  ["Depth", [/^depth$/i]],
  ["Dragon Age: Inquisition", [/dragon age/i]],
  ["Broforce", [/\bbroforce\b/i]],
  ["Starforge", [/\bstarforge\b/i]],
  ["Fallout", [/\bfallout\b/i]],
  ["Trine", [/\btrine\b/i]],
  ["Helldivers", [/helldivers/i]],
  ["Wreckfest", [/wreckfest/i]],
  ["Elden Ring", [/elden ring/i]],
  ["Devour", [/\bdevour\b/i]],
  ["Half Dead 3", [/half dead/i]],
  ["Jackbox", [/jackbox/i]],
  ["Two Rooms and a Boom", [/two rooms and a boom/i]],
  ["CardLife", [/\bcardlife\b/i]],
  ["Unbox", [/^unbox\b/i]],
  ["Contractville", [/contractville/i]],
  ["Yogscast Poker", [/yogscast poker/i]],
];

// ---------------------------------------------------------------------------
// Series — named story arcs/worlds (Shadow of Israphel, Jaffa Factory...) and
// recurring show formats (Tiny Teams, Games Night, Simon's Peculiar
// Portions...). Unlike games, a video can be in more than one series (e.g. a
// Hat Films game show during Camp Yog), and most videos aren't in any — those
// just get an empty list rather than an "Other" bucket.
// Things that are simply a game or game mode (Gmod TTT, Dread Hunger...) are
// left to the game filter.
// ---------------------------------------------------------------------------
const SERIES = [
  // --- Classic Minecraft arcs & worlds ---
  ["Shadow of Israphel", [/israphel/i]],
  ["Sunshine of Israpony", [/israpony/i]],
  ["Jaffa Factory", [/jaffa\s*factory/i]],
  ["JaffaQuest", [/jaffa\s*quest/i]],
  ["MoonQuest", [/moon\s*quest/i]],
  ["MarsQuest", [/mars\s*quest/i]],
  ["YogsQuest", [/yogsquest/i]],
  ["YogLabs", [/yog\s*labs/i]],
  ["Deep Space Mine", [/deep space mine/i]],
  ["Deep Space Turtle Chase", [/deep space turtle/i]],
  ["Trials of Derpulies", [/trials of derpulies/i]],
  ["Trials of Skobbels", [/trials of skobbels/i]],
  ["Whale Lords", [/whale lords/i]],
  ["Captive Minecraft", [/captive minecraft/i]],
  ["Minecraft Diversity", [/\bdiversity\b/i]],
  ["Survival Island", [/survival island/i]],
  ["Monarch of Madness", [/monarch of madness/i]],
  ["Pumpkin Prince", [/pumpkin (prince|lord)/i]],
  ["Professor Grizwald", [/grizwald/i]],
  ["It's Better Together", [/it'?s better together/i]],
  ["No Learning Curve", [/no learning curve/i]],
  ["Iron Rose", [/\biron rose\b/i]],
  ["The Tourist", [/\bthe tourist\b/i]],
  ["Tunnel Vision", [/tunnel vision/i]],
  ["Lucky Block Challenge", [/lucky block/i]],
  ["Mod Spotlight", [/mod spotlight/i]],
  ["Monster Mash", [/monster mash/i]],
  ["Build Battle", [/build battle/i]],
  ["Capture the Wool", [/capture the wool/i]],
  ["Race for the Wool", [/race for the wool/i]],
  ["Trucking Tuesday", [/trucking tuesday/i]],
  ["KirbyCraft", [/kirby\s*craft/i]],
  ["Pass the Save", [/pass the save/i]],
  ["Minecraft Gartic Phone", [/gartic phone/i]],

  // --- Other classic shows & arcs ---
  ["Yogpod Animations", [/yogpod animation/i]],
  ["YogPrix", [/yogprix/i]],
  ["Simple Simon", [/simple simon/i]],
  ["Paladins Quest", [/paladins quest/i]],
  ["A Day in Tuscarora", [/day in tuscarora/i]],
  ["Lewis Plays!", [/lewis plays/i]],
  ["Fun Friday", [/fun friday/i]],
  ["Fan Friday", [/fan friday/i]],
  ["Yogscast Top 5", [/yogscast top 5/i]],
  ["YogNews", [/yognews/i]],
  ["YogTrailers", [/yogtrailers?/i]],
  ["The Tryhard Chronicles", [/tryhard chronicles/i]],
  ["The Michael Jackson Chronicles", [/michael jackson chronicles/i]],
  ["Game Goblin", [/game goblin/i]],
  ["Simon Days To Die", [/simon days to die/i]],

  // --- Modern recurring shows & events ---
  ["Blood on the Clocktower", [/blood on the clocktower/i, /\bbotc\b/i, /brindley manor/i]],
  ["Jingle Jam", [/jingle\s*jam/i]],
  ["Tiny Teams", [/tiny teams/i]],
  ["Pickaxe Week", [/pickaxe week/i]],
  ["Camp Yog", [/camp yog/i]],
  ["Games Night", [/games night/i]],
  ["The Yogscast Games Show", [/yogscast games show/i]],
  ["Simon's Peculiar Portions", [/peculiar portions/i]],
  ["Kirby Valley", [/kirby\s*valley/i]],
  ["Game Hunters", [/game hunters/i]],
  ["The Pusher & The Strangler", [/pusher (and|&) (the )?strangler/i]],
  ["Murder on Minecraft Express", [/murder on minecraft express/i]],
];

const OVERRIDES_PATH = path.join(__dirname, "..", "tag-overrides.json");
let overridesCache = null;

function loadOverrides() {
  if (overridesCache) return overridesCache;
  overridesCache = fs.existsSync(OVERRIDES_PATH)
    ? JSON.parse(fs.readFileSync(OVERRIDES_PATH, "utf8"))
    : {};
  return overridesCache;
}

function tagGames(title) {
  for (const [name, patterns] of GAMES) {
    if (patterns.some((p) => p.test(title))) return [name];
  }
  return ["Other"];
}

function tagSeries(title) {
  const found = [];
  for (const [name, patterns] of SERIES) {
    if (patterns.some((p) => p.test(title))) found.push(name);
  }
  return found;
}

// Returns { games, series } for a video, applying any hand fixes from
// tag-overrides.json on top of the title matching.
function tagVideo(video) {
  const override = loadOverrides()[video.videoId] || {};
  return {
    games: override.games || tagGames(video.title || ""),
    series: override.series || tagSeries(video.title || ""),
  };
}

// Only the first non-empty line of a description is ever shown on the site —
// the rest is boilerplate (links, socials, contact info) that just bloats the
// JSON (~11MB down to ~2.6MB).
function firstLine(description) {
  if (!description) return "";
  for (const line of description.split(/\r?\n/)) {
    if (line.trim()) return line;
  }
  return "";
}

module.exports = { tagVideo, tagGames, tagSeries, firstLine, GAMES, SERIES };
