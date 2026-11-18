"use client";

/**
 * Career missions grouped by game-type family.
 *
 * Six fixed buckets (Standard, LaserBall, Space Marines, Dungeons & Dragons,
 * Death Match / Capture the Flag, Other) with a horizontal bar per bucket
 * showing that family's share of the player's career missions. Each bucket is
 * expandable to reveal the raw game-type strings that fell into it — the
 * underlying names arenas invent vary wildly ("Laserball 12min", "LZ Lazerball",
 * "Space Marines 5", etc.), so the breakdown lets a player see exactly which
 * mode names contributed to each bucket rather than trusting a single number.
 *
 * "Other" is deliberately expandable too: it is ~33% of missions for the
 * tracked population (mostly the source `"Other"` bucket arenas use for
 * anything uncategorised, plus small modes like Supercharge, Highlander,
 * Vampir and Elimination that are too small to slice off), so hiding its
 * contents would leave a big opaque slice.
 *
 * Client component because expand/collapse is local UI state. The heavy data
 * work (classification, aggregation) happens server-side in
 * `getGameTypeCategories` and the result is passed in as props.
 */
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  GAME_TYPE_CATEGORY_COLORS,
  type GameTypeCategory,
} from "@/lib/player-stats";
import { fmtNum } from "@/lib/player-stats";

interface Props {
  categories: GameTypeCategory[];
  /** The player's total career missions — used for the % share labels. */
  totalMissions: number;
}

function fmtLastPlayed(s: string | null): string {
  if (!s) return "—";
  // lastPlayed is "YYYY-MM-DD HH:MM:SS" (UTC); render as Mon YYYY.
  const t = new Date(s.replace(" ", "T") + "Z");
  return t.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function PlayerGameTypes({ categories, totalMissions }: Props) {
  // Expand only the buckets the user clicks; "Other" starts expanded by default
  // since its contents are usually the most surprising.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    Other: true,
  });

  const maxMissions = Math.max(1, ...categories.map(c => c.missions));

  const toggle = (name: string) =>
    setExpanded(prev => ({ ...prev, [name]: !prev[name] }));

  return (
    <div className="space-y-2">
      {categories.map(cat => {
        const isOpen = !!expanded[cat.name];
        const sharePct = totalMissions > 0 ? (cat.missions / totalMissions) * 100 : 0;
        const barPct = (cat.missions / maxMissions) * 100;
        const color = GAME_TYPE_CATEGORY_COLORS[cat.name];
        const hasRows = cat.rows.length > 0;

        return (
          <div key={cat.name} className="rounded-lg border border-zinc-800 bg-zinc-900/40">
            <button
              type="button"
              onClick={() => toggle(cat.name)}
              disabled={!hasRows}
              aria-expanded={isOpen}
              aria-controls={`cat-detail-${cat.name}`}
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm disabled:cursor-default"
            >
              <ChevronRight
                className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${
                  isOpen ? "rotate-90" : ""
                } ${hasRows ? "" : "opacity-30"}`}
              />
              <div className="w-48 shrink-0 truncate text-zinc-100">{cat.name}</div>
              <div className="h-4 flex-1 overflow-hidden rounded bg-zinc-800">
                <div
                  className="h-full rounded"
                  style={{ width: `${cat.missions === 0 ? 0 : Math.max(2, barPct)}%`, backgroundColor: color }}
                />
              </div>
              <div className="w-16 text-right tabular-nums text-zinc-100">{fmtNum(cat.missions)}</div>
              <div className="w-14 shrink-0 text-right text-xs text-zinc-400">
                {sharePct.toFixed(1)}%
              </div>
            </button>

            {isOpen && hasRows ? (
              <div
                id={`cat-detail-${cat.name}`}
                className="border-t border-zinc-800/60 px-3 py-2"
              >
                <div className="mb-1 text-xs text-zinc-500">
                  {cat.rows.length} mode{cat.rows.length === 1 ? "" : "s"} in this category
                </div>
                <div className="space-y-1">
                  {cat.rows.map(r => {
                    const innerMax = cat.rows[0]?.missions || 1;
                    const innerPct = (r.missions / innerMax) * 100;
                    return (
                      <div key={r.type} className="flex items-center gap-3 text-xs">
                        <div className="w-44 shrink-0 truncate text-right text-zinc-300" title={r.type}>
                          {r.type}
                        </div>
                        <div className="h-2.5 flex-1 overflow-hidden rounded bg-zinc-800/70">
                          <div
                            className="h-full rounded opacity-60"
                            style={{ width: `${Math.max(2, innerPct)}%`, backgroundColor: color }}
                          />
                        </div>
                        <div className="w-14 text-right tabular-nums text-zinc-200">{fmtNum(r.missions)}</div>
                        <div className="w-16 shrink-0 text-right text-zinc-500">{fmtLastPlayed(r.lastPlayed)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
} "use client";

/**
 * Career missions grouped by game-type family.
 *
 * Six fixed buckets (Standard, LaserBall, Space Marines, Dungeons & Dragons,
 * Death Match / Capture the Flag, Other) with a horizontal bar per bucket
 * showing that family's share of the player's career missions. Each bucket is
 * expandable to reveal the raw game-type strings that fell into it — the
 * underlying names arenas invent vary wildly ("Laserball 12min", "LZ Lazerball",
 * "Space Marines 5", etc.), so the breakdown lets a player see exactly which
 * mode names contributed to each bucket rather than trusting a single number.
 *
 * "Other" is deliberately expandable too: it is ~33% of missions for the
 * tracked population (mostly the source `"Other"` bucket arenas use for
 * anything uncategorised, plus small modes like Supercharge, Highlander,
 * Vampir and Elimination that are too small to slice off), so hiding its
 * contents would leave a big opaque slice.
 *
 * Client component because expand/collapse is local UI state. The heavy data
 * work (classification, aggregation) happens server-side in
 * `getGameTypeCategories` and the result is passed in as props.
 */
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  GAME_TYPE_CATEGORY_COLORS,
  type GameTypeCategory,
} from "@/lib/player-stats";
import { fmtNum } from "@/lib/player-stats";

interface Props {
  categories: GameTypeCategory[];
  /** The player's total career missions — used for the % share labels. */
  totalMissions: number;
}

function fmtLastPlayed(s: string | null): string {
  if (!s) return "—";
  // lastPlayed is "YYYY-MM-DD HH:MM:SS" (UTC); render as Mon YYYY.
  const t = new Date(s.replace(" ", "T") + "Z");
  return t.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function PlayerGameTypes({ categories, totalMissions }: Props) {
  // Expand only the buckets the user clicks; "Other" starts expanded by default
  // since its contents are usually the most surprising.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    Other: true,
  });

  const maxMissions = Math.max(1, ...categories.map(c => c.missions));

  const toggle = (name: string) =>
    setExpanded(prev => ({ ...prev, [name]: !prev[name] }));

  return (
    <div className="space-y-2">
      {categories.map(cat => {
        const isOpen = !!expanded[cat.name];
        const sharePct = totalMissions > 0 ? (cat.missions / totalMissions) * 100 : 0;
        const barPct = (cat.missions / maxMissions) * 100;
        const color = GAME_TYPE_CATEGORY_COLORS[cat.name];
        const hasRows = cat.rows.length > 0;

        return (
          <div key={cat.name} className="rounded-lg border border-zinc-800 bg-zinc-900/40">
            <button
              type="button"
              onClick={() => toggle(cat.name)}
              disabled={!hasRows}
              aria-expanded={isOpen}
              aria-controls={`cat-detail-${cat.name}`}
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm disabled:cursor-default"
            >
              <ChevronRight
                className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${
                  isOpen ? "rotate-90" : ""
                } ${hasRows ? "" : "opacity-30"}`}
              />
              <div className="w-48 shrink-0 truncate text-zinc-100">{cat.name}</div>
              <div className="h-4 flex-1 overflow-hidden rounded bg-zinc-800">
                <div
                  className="h-full rounded"
                  style={{ width: `${cat.missions === 0 ? 0 : Math.max(2, barPct)}%`, backgroundColor: color }}
                />
              </div>
              <div className="w-16 text-right tabular-nums text-zinc-100">{fmtNum(cat.missions)}</div>
              <div className="w-14 shrink-0 text-right text-xs text-zinc-400">
                {sharePct.toFixed(1)}%
              </div>
            </button>

            {isOpen && hasRows ? (
              <div
                id={`cat-detail-${cat.name}`}
                className="border-t border-zinc-800/60 px-3 py-2"
              >
                <div className="mb-1 text-xs text-zinc-500">
                  {cat.rows.length} mode{cat.rows.length === 1 ? "" : "s"} in this category
                </div>
                <div className="space-y-1">
                  {cat.rows.map(r => {
                    const innerMax = cat.rows[0]?.missions || 1;
                    const innerPct = (r.missions / innerMax) * 100;
                    return (
                      <div key={r.type} className="flex items-center gap-3 text-xs">
                        <div className="w-44 shrink-0 truncate text-right text-zinc-300" title={r.type}>
                          {r.type}
                        </div>
                        <div className="h-2.5 flex-1 overflow-hidden rounded bg-zinc-800/70">
                          <div
                            className="h-full rounded opacity-60"
                            style={{ width: `${Math.max(2, innerPct)}%`, backgroundColor: color }}
                          />
                        </div>
                        <div className="w-14 text-right tabular-nums text-zinc-200">{fmtNum(r.missions)}</div>
                        <div className="w-16 shrink-0 text-right text-zinc-500">{fmtLastPlayed(r.lastPlayed)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
} 
