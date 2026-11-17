'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Target } from "lucide-react";

/**
 * Site-wide top navigation.
 *
 * Mounted once in the root layout so it renders on every route. The palette
 * (zinc-950 bar, zinc-400 idle text, cyan-400 accent) mirrors the players
 * pages so the header reads as part of the same surface on `/players` and
 * `/players/[token]`, while still sitting cleanly above the light-themed
 * centres table on `/`.
 */
const NAV_LINKS = [
  { href: "/", label: "Centres" },
  { href: "/players", label: "Players" },
] as const;

export function Navbar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/60">
      <nav
        className="mx-auto flex h-14 max-w-5xl items-center gap-1 px-4"
        aria-label="Main navigation"
      >
        <Link
          href="/"
          className="mr-4 flex items-center gap-2 font-semibold text-zinc-100"
        >
          <Target className="h-5 w-5 text-cyan-400" aria-hidden="true" />
          <span>Laserforce Stats</span>
        </Link>

        {NAV_LINKS.map((link) => {
          const active = isActive(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                active
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
