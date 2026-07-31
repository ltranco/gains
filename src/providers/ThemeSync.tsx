"use client"

import { useEffect } from "react"

import { STORAGE_KEY } from "@/lib/store"
import { usePrefs } from "./StoreProvider"

/**
 * Runs before first paint, so the page never renders in the wrong theme and then snaps.
 * It reads localStorage directly rather than waiting for React to hydrate — by the time a
 * provider effect fires, the flash has already happened.
 *
 * Stringified deliberately: this has to be a synchronous <script> in <head>.
 */
export const themeBootstrapScript = `
(function () {
  try {
    var raw = localStorage.getItem("${STORAGE_KEY}");
    var theme = raw ? (JSON.parse(raw).prefs || {}).theme : "system";
    if (theme === "light" || theme === "dark") {
      document.documentElement.setAttribute("data-theme", theme);
    }
  } catch (e) {}
})();
`

/** Keeps <html data-theme> in step with the stored preference after hydration. */
export function ThemeSync() {
  const { theme } = usePrefs()

  useEffect(() => {
    const root = document.documentElement
    if (theme === "system") {
      root.removeAttribute("data-theme")
    } else {
      root.setAttribute("data-theme", theme)
    }
  }, [theme])

  return null
}
