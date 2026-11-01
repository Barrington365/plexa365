(() => {
  if (window.__plexaThemeBound) return;
  window.__plexaThemeBound = true;
  const key = "plexa-theme-mode";
  const legacyKeys = ["plexa-studio-theme", "plexa-theme", "msn-local-theme"];

  function storedMode() {
    try {
      const mode = localStorage.getItem(key);
      if (mode === "light" || mode === "dark" || mode === "system") return mode;
      for (const legacy of legacyKeys) {
        if (localStorage.getItem(legacy) === "dark") {
          localStorage.setItem(key, "dark");
          return "dark";
        }
      }
    } catch {}
    return "system";
  }

  function isDark(mode) {
    return mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }

  function paint(dark) {
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.classList.toggle("light", !dark);
    document.body.classList.toggle("dark", dark);
    for (const id of ["theme-toggle", "theme"]) {
      const button = document.getElementById(id);
      if (!button) continue;
      button.setAttribute("aria-pressed", String(dark));
      const label = button.textContent.trim();
      if (label === "Dark mode" || label === "Light mode") button.textContent = dark ? "Light mode" : "Dark mode";
    }
  }

  function applyStored() {
    paint(isDark(storedMode()));
  }

  applyStored();
  document.addEventListener("click", (event) => {
    const button = event.target.closest && event.target.closest("#theme-toggle, #theme");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const dark = !document.body.classList.contains("dark");
    paint(dark);
    try { localStorage.setItem(key, dark ? "dark" : "light"); } catch {}
  }, true);
  window.addEventListener("storage", (event) => {
    if (event.key === key || legacyKeys.includes(event.key)) applyStored();
  });
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", () => {
    if (storedMode() === "system") applyStored();
  });
})();
