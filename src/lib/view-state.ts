export type LibrarySort = "name" | "playtime" | "completion" | "last";
export type LibraryFilter =
  "all" | "achievements" | "almost" | "planned" | "completed";
export type AchievementSort = "rarity" | "impact" | "name" | "game" | "date";
export type AchievementFilter =
  "all" | "unlocked" | "locked" | "rare" | "recent";
export const libraryView = () => ({
  query: "",
  filter: "all" as LibraryFilter,
  sort: "playtime" as LibrarySort,
  ascending: false,
  page: 0,
});
export const achievementView = () => ({
  query: "",
  filter: "all" as AchievementFilter,
  sort: "rarity" as AchievementSort,
  ascending: false,
  page: 0,
});
