/**
 * Shared types between the players overview page (server component) and the
 * PlayersList client component.
 *
 * This is a plain .ts module — no "use client" — so the type can be imported
 * from both server and client code via `import type` without crossing the App
 * Router client-boundary export scan. (A runtime `export interface` from a
 * "use client" file fails the SWC client-reference registration pass on the
 * webpack/Vercel build, even though Turbopack tolerates it.)
 */

/** Slim, serialisable summary of a tracked player for the list view. */
export interface PlayerListRow {
  token: string;
  codename: string;
  avatar: string;
  totalMissions: number;
  centreCount: number;
  joinDate: string | null;
  archivePointCount: number;
} 
