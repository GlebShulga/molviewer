// Apply the saved or system theme before first paint, so pages outside the
// React app (and the landing text below the viewer) don't flash the wrong
// colors. Mirrors getInitialTheme() in src/context/ThemeContext.tsx.
(function () {
  var theme = 'dark';
  try {
    var stored = localStorage.getItem('mol3d-theme');
    if (stored === 'light' || stored === 'dark') {
      theme = stored;
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      theme = 'light';
    }
  } catch {
    // localStorage blocked: keep the default.
  }
  document.documentElement.setAttribute('data-theme', theme);
})();
