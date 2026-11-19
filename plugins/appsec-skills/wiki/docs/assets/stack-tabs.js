// Opens the example tab for a stack named in the URL, so a report or a threat model
// can link straight to the code for the project's technology:
//
//   /threats/source-to-sink/command-injection/?stack=python#examples
//   /threats/business-logic/csrf/?stack=flask,express
//
// `stack` takes example file names (`examples/<threat>/<stack>.md`), comma-separated,
// first match wins. A file name matches the tab whose label, without the "(Py)" part and
// without punctuation, is the same; ALIASES covers the file names that don't
// (`.github/scripts/check-stack-tabs.mjs` checks every tab resolves).
(() => {
  /* ALIASES:BEGIN */
  const ALIASES = {
    "dotnet": "net",
    "node": "nodejs",
    "pg": "nodepostgres",
    "vanilla-js": "fetchapi"
  };
  /* ALIASES:END */

  const norm = (s) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
  const wanted = (value) =>
    value.split(',').map((v) => v.trim().toLowerCase()).filter(Boolean).map((v) => norm(ALIASES[v] ?? v));

  const select = () => {
    const param = new URLSearchParams(window.location.search).get('stack');
    if (!param) return;
    const names = wanted(param);
    let first = null;
    for (const set of document.querySelectorAll('.tabbed-set')) {
      const labels = Array.from(set.querySelectorAll(':scope > .tabbed-labels > label'));
      const label = names.map((n) => labels.find((l) => norm(l.textContent) === n)).find(Boolean);
      if (!label) continue;
      const input = document.getElementById(label.htmlFor);
      if (input && !input.checked) input.click();
      first ??= set;
    }
    // Keep the page on the examples once the tab has switched.
    if (first && window.location.hash === '#examples') {
      document.getElementById('examples')?.scrollIntoView();
    }
  };

  // Material for MkDocs / Zensical expose document$ when instant navigation is on.
  if (window.document$?.subscribe) window.document$.subscribe(select);
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', select);
  else select();
})();
