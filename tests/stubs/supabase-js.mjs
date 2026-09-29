/* ============================================================================
   стаб @supabase/supabase-js для тестов Edge Functions.
   Эмулирует ровно то, что используют функции:
     createClient(url, key, { global: { headers: { Authorization } } })
     auth.getUser(), auth.admin.deleteUser(uid)
     from(t).select().eq/gte/lte/in().order().limit().maybeSingle()
     from(t).insert(rows) · upsert(rows, { onConflict }) · delete().eq()
   Клиент с service_role видит всё; клиент с JWT пользователя — только свои
   строки (упрощённая RLS). Данные лежат в globalThis.__FT_DB, пользователи —
   в globalThis.__FT_USERS (токен → { id, email }).
   ========================================================================== */

const PKS = {
  finance_operations: ['user_id', 'client_id'],
  finance_profiles: ['user_id'],
  telegram_accounts: ['user_id'],
  telegram_link_codes: ['id'],
};

function table() { return globalThis.__FT_DB || {}; }

function clone(x) { return x === undefined ? x : JSON.parse(JSON.stringify(x)); }

function isAdmin(key) {
  return key === (globalThis.__FT_ENV.SUPABASE_SERVICE_ROLE_KEY || 'service-role');
}

function err(message) { return { message, code: 'PGRST' }; }

class Query {
  constructor(table_, admin, user) {
    this.t = table_;
    this.admin = admin;
    this.user = user;
    this.filters = [];
    this.op = 'select';
    this.rows = null;
    this.values = null;
    this.conflict = null;
    this.limitN = null;
    this.orderSpec = null;
    this.wantMaybeSingle = false;
    this.wantSingle = false;
  }
  select() { return this; }
  eq(c, v) { this.filters.push(r => r[c] === v); return this; }
  gte(c, v) { this.filters.push(r => String(r[c]) >= String(v)); return this; }
  lte(c, v) { this.filters.push(r => String(r[c]) <= String(v)); return this; }
  in(c, vs) { this.filters.push(r => (vs || []).includes(r[c])); return this; }
  order(c, opts) { this.orderSpec = { c, asc: !opts || opts.ascending !== false }; return this; }
  limit(n) { this.limitN = n; return this; }
  insert(rows) { this.op = 'insert'; this.rows = Array.isArray(rows) ? rows : [rows]; return this; }
  upsert(rows, opts) { this.op = 'upsert'; this.rows = Array.isArray(rows) ? rows : [rows]; this.conflict = opts && opts.onConflict; return this; }
  update(values) { this.op = 'update'; this.values = values; return this; }
  delete() { this.op = 'delete'; return this; }
  maybeSingle() { this.wantMaybeSingle = true; return this; }
  single() { this.wantSingle = true; return this; }

  match(r) { return this.filters.every(f => f(r)); }

  keyOf(row) {
    const cols = this.conflict ? String(this.conflict).split(',') : (PKS[this.t] || Object.keys(row));
    return cols.map(c => String(row[c])).join('|');
  }

  async exec() {
    const db = table();
    const t = db[this.t] = db[this.t] || [];

    if (this.op === 'insert') {
      for (const row of this.rows) {
        if (!this.admin && (!this.user || row.user_id !== this.user.id)) {
          return { data: null, error: err('new row violates row-level security policy for table "' + this.t + '"') };
        }
        t.push(clone(row));
      }
      return { data: clone(this.rows), error: null };
    }

    if (this.op === 'upsert') {
      for (const row of this.rows) {
        if (!this.admin && (!this.user || row.user_id !== this.user.id)) {
          return { data: null, error: err('new row violates row-level security policy for table "' + this.t + '"') };
        }
        const key = this.keyOf(row);
        const cols = this.conflict ? String(this.conflict).split(',') : (PKS[this.t] || []);
        const i = t.findIndex(r => cols.map(c => String(r[c])).join('|') === key);
        if (i >= 0) t[i] = Object.assign({}, t[i], clone(row));
        else t.push(clone(row));
      }
      return { data: clone(this.rows), error: null };
    }

    // выборка/изменение/удаление — с учётом RLS
    const visible = this.admin ? t : (this.user ? t.filter(r => r.user_id === this.user.id) : []);

    if (this.op === 'delete') {
      const keep = t.filter(r => !(visible.includes(r) && this.match(r)));
      const removed = t.length - keep.length;
      db[this.t] = keep;
      return { data: null, error: null, removed };
    }

    if (this.op === 'update') {
      let n = 0;
      for (const r of visible) if (this.match(r)) { Object.assign(r, clone(this.values)); n++; }
      return { data: null, error: null, updated: n };
    }

    let rows = visible.filter(r => this.match(r));
    if (this.orderSpec) {
      const { c, asc } = this.orderSpec;
      rows = rows.slice().sort((a, b) => (String(a[c]) < String(b[c]) ? (asc ? -1 : 1) : String(a[c]) > String(b[c]) ? (asc ? 1 : -1) : 0));
    }
    if (this.limitN !== null) rows = rows.slice(0, this.limitN);
    rows = clone(rows);

    if (this.wantMaybeSingle) return { data: rows[0] || null, error: null };
    if (this.wantSingle) return rows[0] ? { data: rows[0], error: null } : { data: null, error: err('no rows') };
    return { data: rows, error: null };
  }

  then(onFulfilled, onRejected) { return this.exec().then(onFulfilled, onRejected); }
}

export function createClient(url, key, opts = {}) {
  const admin = isAdmin(key);
  let user = null;
  if (!admin) {
    const auth = (opts && opts.global && opts.global.headers && opts.global.headers.Authorization) || '';
    const token = String(auth).replace(/^Bearer\s+/i, '').trim();
    user = (globalThis.__FT_USERS || {})[token] || null;
  }
  const client = {
    __url: url,
    __admin: admin,
    __user: user,
    auth: {
      getUser: async () => user
        ? { data: { user }, error: null }
        : { data: { user: null }, error: err('invalid JWT: unable to parse or verify') },
      admin: {
        deleteUser: async (uid) => {
          if (!admin) return { data: null, error: err('not admin') };
          const users = globalThis.__FT_USERS || {};
          for (const [token, u] of Object.entries(users)) if (u.id === uid) delete users[token];
          // каскад, как в схеме (on delete cascade)
          const db = table();
          for (const name of ['finance_operations', 'finance_profiles', 'telegram_accounts', 'telegram_link_codes']) {
            db[name] = (db[name] || []).filter(r => r.user_id !== uid);
          }
          return { data: { user: null }, error: null };
        },
      },
    },
    from: (name) => new Query(name, admin, user),
  };
  return client;
}
