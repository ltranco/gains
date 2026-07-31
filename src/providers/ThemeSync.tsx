"use client"

import { useEffect } from "react"

import { resolveAccent } from "@/lib/accents"
import { STORAGE_KEY } from "@/lib/store"
import { usePrefs } from "./StoreProvider"

/**
 * Runs before first paint, so the page never renders in the wrong theme or accent and then
 * snaps. It reads localStorage directly rather than waiting for React to hydrate — by the
 * time a provider effect fires, the flash has already happened.
 *
 * The hex branch duplicates a little of `lib/accents.ts` on purpose: this has to be a
 * self-contained synchronous <script> in <head>, so it can't import anything.
 */
export const themeBootstrapScript = `
(function () {
  try {
    var raw = localStorage.getItem("${STORAGE_KEY}");
    var prefs = raw ? (JSON.parse(raw).prefs || {}) : {};
    var el = document.documentElement;

    if (prefs.theme === "light" || prefs.theme === "dark") {
      el.setAttribute("data-theme", prefs.theme);
    }

    var a = prefs.accent;
    if (typeof a === "string" && /^#[0-9a-fA-F]{6}$/.test(a)) {
      var ch = [1, 3, 5].map(function (i) { return parseInt(a.substr(i, 2), 16) });
      var hex = function (n) { return Math.round(n).toString(16).padStart(2, "0") };
      var lum = ch.map(function (c) {
        var s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      el.style.setProperty("--accent", a);
      el.style.setProperty("--accent-hover",
        "#" + ch.map(function (c) { return hex(c * 0.87) }).join(""));
      el.style.setProperty("--accent-text",
        0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2] > 0.45 ? "#16161a" : "#ffffff");
    } else if (a) {
      el.setAttribute("data-accent", a);
    }
  } catch (e) {}
})();
`

/** Keeps <html> in step with the stored theme and accent after hydration. */
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
    const root = document.documentElement
    const resolved = resolveAccent(accent)
    if (!resolved) return

    // Presets go through a data attribute so the CSS holds the values; a custom hex has no
    // stylesheet rule to hit, so it's written inline. Only ever one of the two is live.
    if (accent.startsWith("#")) {
      root.removeAttribute("data-accent")
      root.style.setProperty("--accent", resolved.base)
      root.style.setProperty("--accent-hover", resolved.hover)
      root.style.setProperty("--accent-text", resolved.text)
    } else {
      root.style.removeProperty("--accent")
      root.style.removeProperty("--accent-hover")
      root.style.removeProperty("--accent-text")
      root.setAttribute("data-accent", accent)
    }
  }, [accent])

  return null
}
