/* Hello Kaffi · copies the app's data into the REAL Supabase tables.
   Put this file at:  api/_lib/tables.js   (the underscore folder keeps Vercel from publishing it as an endpoint)

   How it works: api/index.js still saves its JSON in kaffi_docs (that is what the app reads from).
   After every successful save, sync() compares the data with what it last copied and writes ONLY the
   changes into staff_accounts, customers, menu_items, riders, orders, order_items, payments, ... .
   If a copy fails, the app keeps working and the error is printed in the console (starting with [tables]). */
const { createClient } = require("@supabase/supabase-js");

let sb = null;
const enabled = () =>
  !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
const client = () =>
  sb ||
  (sb = createClient(
    process.env.SUPABASE_URL.trim(),
    process.env.SUPABASE_SERVICE_KEY.trim(),
    { auth: { persistSession: false, autoRefreshToken: false } },
  ));

/* ---------- small helpers ---------- */
const iso = (ms) =>
  ms && Number.isFinite(+ms) && +ms > 0 ? new Date(+ms).toISOString() : null;
const num = (v) => (Number.isFinite(+v) ? +v : 0);
const txt = (v, n) => {
  const s = String(v == null ? "" : v).trim();
  return s ? s.slice(0, n || 500) : null;
};
const low = (e) =>
  String(e || "")
    .trim()
    .toLowerCase();

const STATUSES = [
  "Pending",
  "Payment Review",
  "Payment Retry",
  "Preparing",
  "Ready",
  "Completed",
  "Cancelled",
];
const REASONS = ["customer", "fake_proof"];
const methodOf = (p) =>
  /gcash/i.test(p || "") ? "GCash" : /^cash$/i.test(p || "") ? "Cash" : "COD";

/* ---------- turn the app's in-memory database into table rows ---------- */
function build(db) {
  const T = {
    staff_accounts: [],
    customers: [],
    cod_bans: [],
    menu_categories: [],
    menu_items: [],
    riders: [],
    orders: [],
  };

  // staff
  const staffByName = {};
  (db.users || []).forEach((u) => {
    staffByName[u.name] = u.username;
    T.staff_accounts.push({
      username: u.username,
      full_name: u.name,
      role_code: u.role,
      password_hash: u.pass,
    });
  });

  // customers: username/password accounts + Google profiles, merged by email
  const cust = new Map();
  const blank = (email, name, ms, provider) => ({
    email,
    username: null,
    full_name: name || email,
    phone: null,
    address: null,
    password_hash: null,
    auth_provider: provider,
    created_at: iso(ms),
    profile_updated_at: null,
  });
  (db.customers || []).forEach((c) => {
    const e = low(c.email);
    cust.set(e, {
      ...blank(e, c.name, c.createdAt, "password"),
      username: c.username,
      password_hash: c.pass || null,
    });
  });
  Object.entries(db.profiles || {}).forEach(([email, p]) => {
    const e = low(email),
      c = cust.get(e) || blank(e, p.name, p.updatedAt, "google");
    cust.set(e, {
      ...c,
      full_name: p.name || c.full_name,
      phone: p.phone || null,
      address: p.address || null,
      profile_updated_at: iso(p.updatedAt),
    });
  });
  const ensure = (email, name, ms) => {
    const e = low(email);
    if (e && !cust.has(e)) cust.set(e, blank(e, name, ms, "google"));
    return e;
  };

  Object.entries(db.codBans || {}).forEach(([email, until]) => {
    if (until)
      T.cod_bans.push({
        customer_email: ensure(email, null, until),
        banned_until: iso(until),
      });
  });

  // menu
  const cats = [];
  (db.menu || []).forEach((m) => {
    if (!cats.includes(m.category)) cats.push(m.category);
    T.menu_items.push({
      id: m.id,
      category: m.category,
      name: m.name,
      description: txt(m.desc, 300),
      price: num(m.price),
      stock: Math.max(0, Math.floor(num(m.stock))),
    });
  });
  cats.forEach((c, i) =>
    T.menu_categories.push({ name: c, sort_order: i + 1 }),
  );

  // riders
  (db.riders || []).forEach((r) =>
    T.riders.push({
      id: r.id,
      name: r.name,
      phone: txt(r.phone, 30),
      is_on_duty: r.onDuty !== false,
      is_returning: !!r.returning,
    }),
  );

  // orders (+ their items, discount, payment, delivery)
  const menuIds = new Set((db.menu || []).map((m) => m.id)),
    riderIds = new Set((db.riders || []).map((r) => r.id));
  (db.orders || []).forEach((o) => {
    const email = o.email ? ensure(o.email, o.customer, o.createdAt) : null;
    const status = STATUSES.includes(o.status) ? o.status : "Pending";
    const reason =
      status === "Cancelled" && o.cancelReason
        ? REASONS.includes(o.cancelReason)
          ? o.cancelReason
          : "other"
        : null;
    T.orders.push({
      order: {
        id: o.id,
        source_code: o.source === "POS" ? "POS" : "Online",
        type_code: ["delivery", "pickup", "walk-in"].includes(o.type)
          ? o.type
          : "pickup",
        service_code: ["dine-in", "take-out"].includes(o.service)
          ? o.service
          : null,
        status_code: status,
        customer_email: email,
        customer_name: txt(o.customer, 60),
        note: txt(o.note, 200),
        table_no: txt(o.table, 6),
        subtotal: num(o.subtotal),
        discount_amount: num(o.discount && o.discount.amount),
        total: num(o.total),
        placed_at: iso(o.createdAt) || new Date(0).toISOString(),
        cancel_reason_code: reason,
        cancelled_at: iso(o.cancelledAt),
        is_imported: !!o.imported,
      },
      payment: {
        order_id: o.id,
        method_code: methodOf(o.payment),
        amount: num(o.total),
        gcash_ref: txt(o.gcashRef, 40),
        proof_file: txt(o.proofFile, 100),
        proof_viewed: !!o.proofViewed,
        proof_attempts: Math.floor(num(o.proofAttempts)),
        is_paid: !!o.paid,
        checked_by: staffByName[o.paymentCheckedBy] || null,
        checked_at: iso(o.paymentCheckedAt),
      },
      delivery:
        o.type === "delivery"
          ? {
              order_id: o.id,
              address: txt(o.address, 200) || "(no address)",
              contact_phone: txt(o.phone, 30),
              rider_id: riderIds.has(o.riderId) ? o.riderId : null,
              is_dispatched: !!o.dispatched,
              dispatched_at: iso(o.dispatchedAt),
            }
          : null,
      discount: o.discount
        ? {
            order_id: o.id,
            type_code: "Senior Citizen",
            id_number: txt(o.discount.idNumber, 30),
            rate: Math.round(num(o.discount.rate) * 10000) / 100,
            vat_exempt: !!o.discount.vatExempt,
            amount: num(o.discount.amount),
          }
        : null,
      items: (o.items || []).map((i) => ({
        order_id: o.id,
        menu_item_id: menuIds.has(i.id) ? i.id : null,
        item_name: txt(i.name, 120) || "Item",
        unit_price: num(i.price),
        quantity: Math.max(1, Math.floor(num(i.qty))),
      })),
    });
  });

  T.customers = [...cust.values()];
  return T;
}

const KEYS = {
  staff_accounts: "username",
  customers: "email",
  cod_bans: "customer_email",
  menu_categories: "name",
  menu_items: "id",
  riders: "id",
};

/* fingerprint of everything: "table:key" -> JSON */
function snapshot(db) {
  const T = build(db),
    map = new Map();
  Object.entries(KEYS).forEach(([t, k]) =>
    T[t].forEach((r) => map.set(t + ":" + r[k], JSON.stringify(r))),
  );
  T.orders.forEach((b) => map.set("orders:" + b.order.id, JSON.stringify(b)));
  return { map, T };
}

/* ---------- database writes ---------- */
const chunks = (a, n) => {
  const out = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
};
async function upsert(table, rows, onConflict) {
  for (const c of chunks(rows, 400)) {
    const { error } = await client().from(table).upsert(c, { onConflict });
    if (error) throw new Error(table + ": " + error.message);
  }
}
async function insert(table, rows) {
  for (const c of chunks(rows, 400)) {
    const { error } = await client().from(table).insert(c);
    if (error) throw new Error(table + ": " + error.message);
  }
}
async function remove(table, col, ids) {
  for (const c of chunks(ids, 150)) {
    const { error } = await client().from(table).delete().in(col, c);
    if (error) throw new Error(table + ": " + error.message);
  }
}

/* Copy the changes since prev (a Map from snapshot()). Returns the new Map to remember.
   Pass an empty Map to copy EVERYTHING (used by npm run sync-tables). */
async function sync(db, prev) {
  if (!enabled()) return prev;
  const { map, T } = snapshot(db);
  const dirty = (key) => prev.get(key) !== map.get(key);
  const gone = (prefix) =>
    [...prev.keys()]
      .filter((k) => k.startsWith(prefix) && !map.has(k))
      .map((k) => k.slice(prefix.length));
  const changed = (t) => T[t].filter((r) => dirty(t + ":" + r[KEYS[t]]));
  const n = {};

  // 1) people, menu, riders (parents first, so foreign keys always find their parent)
  for (const [t, conflict] of [
    ["staff_accounts", "username"],
    ["customers", "email"],
    ["menu_categories", "name"],
    ["menu_items", "id"],
    ["riders", "id"],
    ["cod_bans", "customer_email"],
  ]) {
    const rows = changed(t);
    n[t] = rows.length;
    if (rows.length) await upsert(t, rows, conflict);
  }

  // 2) orders and their child rows
  const co = T.orders.filter((b) => dirty("orders:" + b.order.id));
  n.orders = co.length;
  if (co.length) {
    const ids = co.map((b) => b.order.id);
    await upsert(
      "orders",
      co.map((b) => b.order),
      "id",
    );
    await upsert(
      "payments",
      co.map((b) => b.payment),
      "order_id",
    );
    await remove("order_items", "order_id", ids); // children are rewritten fresh for the changed orders
    await remove("order_discounts", "order_id", ids);
    await remove("deliveries", "order_id", ids);
    const d = co.map((b) => b.delivery).filter(Boolean),
      s = co.map((b) => b.discount).filter(Boolean),
      it = co.flatMap((b) => b.items);
    if (d.length) await insert("deliveries", d);
    if (s.length) await insert("order_discounts", s);
    if (it.length) await insert("order_items", it);
  }

  // 3) things that no longer exist in the app (orders exported out of sales, deleted menu items / riders)
  const delOrders = gone("orders:").map(Number);
  if (delOrders.length) await remove("orders", "id", delOrders);
  const delMenu = gone("menu_items:").map(Number);
  if (delMenu.length) await remove("menu_items", "id", delMenu);
  const delRiders = gone("riders:").map(Number);
  if (delRiders.length) await remove("riders", "id", delRiders);
  const delBans = gone("cod_bans:");
  if (delBans.length) await remove("cod_bans", "customer_email", delBans);

  return map;
}

module.exports = { enabled, snapshot, sync, build };