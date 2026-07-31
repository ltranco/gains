"use client"

import { useEffect } from "react"

import { STORAGE_KEY } from "@/lib/store"
import { usePrefs } from "./StoreProvider"

/**
 * Runs before first paint, so the page never renders in the wrong theme or accent and then
 * snaps. It reads localStorage directly rather than waiting for React to hydrate — by the
 * time a provider effect fires, the flash has already happened.
 *
 * Stringified deliberately: this has to be a synchronous <script> in <head>.
 */
export const themeBootstrapScript = `
(function () {
  try {
    var raw = localStorage.getItem("${STORAGE_KEY}");
    var prefs = raw ? (JSON.parse(raw).prefs || {}) : {};
    if (prefs.theme === "light" || prefs.theme === "dark") {
      document.documentElement.setAttribute("data-theme", prefs.theme);
    }
    if (prefs.accent) {
      document.documentElement.setAttribute("data-accent", prefs.accent);
    }
  } catch (e) {}
})();
`

/** Keeps <html data-theme> and <html data-accent> in step with stored preferences. */
export function ThemeSync() {
  const { theme, accent } = usePrefs()

  useEffect(() => {
    const root = document.documentElement
    if (theme === "system") {
      root.removeAttribute("data-theme")
    } else {
      root.setAttribute("data-theme", theme)
    }
  }, [theme])

  useEffect(() => {
    document.documentElement.setAttribute("data-accent", accent)
  }, [accent])

  return null
}
