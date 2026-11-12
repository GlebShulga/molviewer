/**
 * Product analytics on the static pages (tool pages, /learn, /collections,
 * /compounds, /about, /privacy...), which don't load the app.
 *
 * - Remembers where this tab's visit started: the entry path, the referring
 *   host and the time, in sessionStorage (gone with the tab), unless already
 *   set. The app's events then report the entry page and the kind of referrer
 *   (src/utils/track.ts reads the same key).
 * - `?internal=1` / `?internal=0` marks or unmarks the owner's browsers.
 * - Wires up the "Turn off product analytics" button on /privacy. While that
 *   flag is set nothing is stored and no event is sent.
 *
 * Keep the three storage names in step with src/utils/track.ts.
 */
(function () {
  var SESSION_KEY = 'mv-session';
  var OPT_OUT_KEY = 'mv-analytics-off';
  var INTERNAL_KEY = 'mv-internal';

  function optedOut() {
    try {
      return localStorage.getItem(OPT_OUT_KEY) === '1';
    } catch {
      return false;
    }
  }

  try {
    var internal = /[?&]internal=([01])(?:&|$)/.exec(location.search);
    if (internal) {
      if (internal[1] === '1') localStorage.setItem(INTERNAL_KEY, '1');
      else localStorage.removeItem(INTERNAL_KEY);
    }
  } catch {
    // Storage blocked.
  }

  function referrerHost() {
    try {
      return document.referrer ? new URL(document.referrer).hostname : '';
    } catch {
      return '';
    }
  }

  if (!optedOut()) {
    try {
      if (!sessionStorage.getItem(SESSION_KEY)) {
        sessionStorage.setItem(
          SESSION_KEY,
          JSON.stringify({ entry: location.pathname, ref: referrerHost(), start: Date.now() })
        );
      }
    } catch {
      // Storage blocked: the app starts its own session.
    }
  }

  function wireToggle() {
    var box = document.getElementById('analytics-optout');
    var button = document.getElementById('analytics-toggle');
    var status = document.getElementById('analytics-status');
    if (!box || !button || !status) return;

    function render() {
      var off = optedOut();
      status.textContent = off
        ? 'Product analytics is off in this browser.'
        : 'Product analytics is on in this browser.';
      button.textContent = off ? 'Turn product analytics back on' : 'Turn off product analytics';
    }

    button.addEventListener('click', function () {
      var turnOff = !optedOut();
      try {
        if (turnOff) localStorage.setItem(OPT_OUT_KEY, '1');
        else localStorage.removeItem(OPT_OUT_KEY);
      } catch {
        status.textContent = 'Your browser blocks site storage, so this setting cannot be saved.';
        return;
      }
      if (turnOff) {
        try {
          sessionStorage.removeItem(SESSION_KEY);
        } catch {
          // Nothing stored there to remove.
        }
      }
      render();
    });

    render();
    box.hidden = false;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireToggle);
  else wireToggle();
})();
