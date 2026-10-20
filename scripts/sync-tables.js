/* One-time / repair helper: copies everything the app has saved into the real Supabase tables.
   Run AFTER supabase/schema.sql:   npm run sync-tables   (needs SUPABASE_URL + SUPABASE_SERVICE_KEY in .env) */
const app = require('../api/index.js');
app.syncTables()
  .then(r => { console.log('Done. Rows copied:', r); process.exit(0); })
  .catch(e => { console.error('Failed:', e.message); process.exit(1); });
