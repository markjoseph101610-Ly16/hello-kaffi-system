/* Hello Kaffi - where the API lives.
   Vercel serves only the pages; the API runs on Render. Set RENDER_API to your Render URL (no trailing slash).
   - On Render itself (same origin)  -> API base is ''
   - VS Code Live Server (port 5500) -> http://localhost:3000
   - Anywhere else (Vercel)          -> RENDER_API */
(function () {
  var RENDER_API = 'https://hello-kaffi-system-database.onrender.com';
  var h = location.hostname, base;
  if (location.port === '5500') base = 'http://localhost:3000';
  else if (h === 'localhost' || h === '127.0.0.1' || /\.onrender\.com$/.test(h)) base = '';
  else base = RENDER_API;
  window.HK_API_BASE = base;
  window.HK_WS_HOST = base ? base.replace(/^https?:\/\//, '') : location.host;
})();
