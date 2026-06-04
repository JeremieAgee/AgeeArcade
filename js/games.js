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
        thumbnail: "./games/maze-runner/thumb.jpg",
        url: "./games/maze-runner/",
        leaderboardUrl: "./games/maze-runner/leaderboard/",
        status: "live"
    },
    {
        id: "depths-of-ashenveil",
        title: "Depths of Ashenveil",
        description: "A 3D browser dungeon crawler. Explore the depths, battle enemies, and uncover the secrets of Ashenveil.",
        genre: ["RPG", "Dungeon Crawler"],
        thumbnail: "./games/depths-of-ashenveil/thumb.jpg",
        url: "./games/depths-of-ashenveil/",
        leaderboardUrl: "./games/depths-of-ashenveil/leaderboard/",
        status: "live"
    }
];

// The game rendered in the home page hero/featured section
const featuredGameId = "depths-of-ashenveil";
