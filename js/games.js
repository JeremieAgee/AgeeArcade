// ─── Game Registry ────────────────────────────────────────────────────────────
// Single source of truth for all games in the arcade.
// To add a new game: push a new object to this array. The grid renders automatically.
//
// status values:
//   "live"        — game is playable now
//   "coming-soon" — shows on grid with a badge, links disabled
// ──────────────────────────────────────────────────────────────────────────────

const games = [
    {
        id: "maze-runner",
        title: "Maze Runner",
        marquee: "MAZE RUNNER",
        tagline: "roguelike mazes",
        description: "Endless procedurally generated 3D mazes. Dodge instant-death traps, collect loot, and survive as many floors as you can.",
        genre: ["Arcade", "Roguelike"],
        thumbnail: "/AgeeArcade/games/maze-runner/thumb.jpg",
        url: "/AgeeArcade/games/maze-runner/",
        leaderboardUrl: "/AgeeArcade/games/maze-runner/leaderboard/",
        status: "live",
        theme: { neon: "#00ff88", screenBg1: "#001a08", screenBg2: "#000d04" }
    },
    {
        id: "blacktide-bastion",
        title: "Blacktide Bastion",
        marquee: "BLACKTIDE",
        tagline: "pirate defense",
        description: "A pirate defense game. Hold the fort against waves of enemy ships in a swashbuckling battle for the seas.",
        genre: ["Arcade", "Defense"],
        thumbnail: "/AgeeArcade/games/blacktide-bastion/thumb.png",
        url: "/AgeeArcade/games/blacktide-bastion/",
        leaderboardUrl: "/AgeeArcade/games/blacktide-bastion/leaderboard/",
        status: "live",
        theme: { neon: "#ff4433", screenBg1: "#1a0505", screenBg2: "#0a0202" }
    },
    {
        id: "spear_fisher",
        title: "Spear Fisher",
        marquee: "SPEAR FISHER",
        tagline: "deep sea arcade",
        description: "A 3D spearfishing arcade game. Aim from the boat, throw your spear, and reel in the biggest catch before time runs out.",
        genre: ["Arcade", "Fishing"],
        thumbnail: "/AgeeArcade/games/spear_fisher/thumb.png",
        url: "/AgeeArcade/games/spear_fisher/",
        leaderboardUrl: "",
        status: "live",
        theme: { neon: "#00ccff", screenBg1: "#001220", screenBg2: "#000810" }
    },
    {
        id: "depths-of-ashenveil",
        title: "Depths of Ashenveil",
        marquee: "ASHENVEIL",
        tagline: "dungeon crawler",
        description: "A 3D browser dungeon crawler. Explore the depths, battle enemies, and uncover the secrets of Ashenveil.",
        genre: ["RPG", "Dungeon Crawler"],
        thumbnail: "/AgeeArcade/games/depths-of-ashenveil/thumb.jpg",
        url: "/AgeeArcade/games/depths-of-ashenveil/",
        leaderboardUrl: "/AgeeArcade/games/depths-of-ashenveil/leaderboard/",
        status: "live",
        theme: { neon: "#d4880a", screenBg1: "#1e0900", screenBg2: "#090300" }
    }
];

// The game rendered in the home page hero/featured section
const featuredGameId = "depths-of-ashenveil";
