"use client"

import Link from "next/link"

import { Logo } from "./Logo"
import { ChevronLeft, Cog } from "./icons"

/** Identity left, settings right. No controls beyond that — everything you touch while
 *  logging now lives at the bottom of the screen, in thumb range. */
export function TopBar() {
  return (
    <header
      className="sticky top-0 z-20 flex items-center justify-between border-b px-3 py-2.5"
      style={{ background: "var(--bg)", paddingTop: "calc(env(safe-area-inset-top) + 0.625rem)" }}
    >
      <Logo />
      <Link
        href="/settings"
        aria-label="Settings"
        className="-mr-1 flex size-9 items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-hover)]"
        style={{ color: "var(--text-muted)" }}
      >
        <Cog size={17} />
      </Link>
    </header>
  )
}

/** Settings and any other secondary page: back arrow plus a title. */
export function SubPageBar({ title, back = "/" }: { title: string; back?: string }) {
  return (
    <header
      className="sticky top-0 z-20 flex items-center gap-1 border-b px-2 py-2.5"
      style={{ background: "var(--bg)", paddingTop: "calc(env(safe-area-inset-top) + 0.625rem)" }}
    >
      <Link
        href={back}
        aria-label="Back"
        className="flex size-9 items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-hover)]"
        style={{ color: "var(--text-muted)" }}
      >
        <ChevronLeft size={18} />
      </Link>
      <h1 className="text-[15px] font-semibold">{title}</h1>
    </header>
  )
}
