// Light/dark switch, shared by every page on the site. A tiny inline script
// in each page's <head> already applies any saved choice before first paint
// (to avoid a flash of the wrong theme); this just wires up the click
// handler and keeps the switch's own visual state in sync.
(function () {
  function initThemeToggle() {
    const toggleEl = document.getElementById("theme-toggle");
    if (!toggleEl) return;

    const getStoredTheme = () => {
      try {
        return localStorage.getItem("theme");
      } catch (err) {
        return null;
      }
    };

    const prefersLight =
      window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
    let theme = getStoredTheme() || (prefersLight ? "light" : "dark");

    applyTheme(theme);

    toggleEl.addEventListener("click", () => {
      theme = theme === "light" ? "dark" : "light";
      applyTheme(theme);
      try {
        localStorage.setItem("theme", theme);
      } catch (err) {}
    });

    function applyTheme(t) {
      document.documentElement.setAttribute("data-theme", t);
      toggleEl.setAttribute("aria-pressed", String(t === "light"));
      toggleEl.setAttribute("aria-label", t === "light" ? "Switch to dark mode" : "Switch to light mode");
    }
  }

  initThemeToggle();
})();
