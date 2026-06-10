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
        description: "Endless procedurally generated 3D mazes. Dodge instant-death traps, collect loot, and survive as many floors as you can.",
        genre: ["Arcade", "Roguelike"],
        thumbnail: "/AgeeArcade/games/maze-runner/thumb.jpg",
        url: "/AgeeArcade/games/maze-runner/",
        leaderboardUrl: "/AgeeArcade/games/maze-runner/leaderboard/",
        status: "live"
    },
    {
        id: "depths-of-ashenveil",
        title: "Depths of Ashenveil",
        description: "A 3D browser dungeon crawler. Explore the depths, battle enemies, and uncover the secrets of Ashenveil.",
        genre: ["RPG", "Dungeon Crawler"],
        thumbnail: "/AgeeArcade/games/depths-of-ashenveil/thumb.jpg",
        url: "/AgeeArcade/games/depths-of-ashenveil/",
        leaderboardUrl: "/AgeeArcade/games/depths-of-ashenveil/leaderboard/",
        status: "live"
    },
    {
        id: "blacktide-bastion",
        title: "Blacktide Bastion",
        description: "A pirate defense game. Hold the fort against waves of enemy ships in a swashbuckling battle for the seas.",
        genre: ["Arcade", "Defense"],
        thumbnail: "/AgeeArcade/games/blacktide-bastion/thumb.png",
        url: "/AgeeArcade/games/blacktide-bastion/",
        leaderboardUrl: "/AgeeArcade/games/blacktide-bastion/leaderboard/",
        status: "live"
    },
    {
        id: "spear_fisher",
        title: "Spear Fisher",
        description: "A 3D spearfishing arcade game. Aim from the boat, throw your spear, and reel in the biggest catch before time runs out.",
        genre: ["Arcade", "Fishing"],
        thumbnail: "",
        url: "/AgeeArcade/games/spear_fisher/",
        leaderboardUrl: "",
        status: "live"
    }
];

// The game rendered in the home page hero/featured section
const featuredGameId = "depths-of-ashenveil";
