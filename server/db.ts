import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import bcrypt from "bcryptjs";

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, "app.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ---------------------------------------------------------------------------
// Schema. Kept intentionally lean: core tables (users, customers, activity)
// are shared by all future modules; presales tables live alongside them.
// ---------------------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  email         TEXT,
  role          TEXT NOT NULL CHECK (role IN ('admin','sales','presales')),
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  entity        TEXT,
  contact_name  TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft','in_progress','in_review','approved','submitted','won','lost','cancelled')),
  owner_id    INTEGER NOT NULL REFERENCES users(id),
  created_by  INTEGER NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_members (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS revisions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rev_no     INTEGER NOT NULL,
  label      TEXT,
  notes      TEXT,
  status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','locked')),
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, rev_no)
);

CREATE TABLE IF NOT EXISTS quotes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  revision_id INTEGER REFERENCES revisions(id) ON DELETE SET NULL,
  vendor      TEXT NOT NULL,
  reference   TEXT,
  currency    TEXT NOT NULL DEFAULT 'USD',
  notes       TEXT,
  created_by  INTEGER NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quote_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id    INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  line_no     INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  part_no     TEXT,
  qty         REAL NOT NULL DEFAULT 1,
  unit_price  REAL NOT NULL DEFAULT 0,
  lead_time   TEXT,
  notes       TEXT
);

CREATE TABLE IF NOT EXISTS costing_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  revision_id   INTEGER NOT NULL REFERENCES revisions(id) ON DELETE CASCADE,
  quote_item_id INTEGER REFERENCES quote_items(id) ON DELETE SET NULL,
  category      TEXT DEFAULT 'Products (CAPEX)',
  description   TEXT NOT NULL,
  vendor        TEXT,
  qty           REAL NOT NULL DEFAULT 1,
  unit_cost     REAL NOT NULL DEFAULT 0,
  margin_pct    REAL NOT NULL DEFAULT 0,
  notes         TEXT,
  sort          INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','blocked','done')),
  priority    TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  assignee_id INTEGER REFERENCES users(id),
  created_by  INTEGER NOT NULL REFERENCES users(id),
  due_date    TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  module      TEXT NOT NULL DEFAULT 'presales',
  project_id  INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  user_id     INTEGER REFERENCES users(id),
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   INTEGER,
  details     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS templates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  module      TEXT NOT NULL DEFAULT 'presales',
  name        TEXT NOT NULL,
  description TEXT,
  config_json TEXT NOT NULL DEFAULT '{}',
  is_default  INTEGER NOT NULL DEFAULT 0,
  created_by  INTEGER REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vendor_formats (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor       TEXT NOT NULL,
  name         TEXT NOT NULL,
  columns_json TEXT NOT NULL DEFAULT '[]',
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS proposal_options (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  revision_id INTEGER NOT NULL REFERENCES revisions(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  template_id INTEGER REFERENCES templates(id) ON DELETE SET NULL,
  created_by  INTEGER NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS option_items (
  option_id       INTEGER NOT NULL REFERENCES proposal_options(id) ON DELETE CASCADE,
  costing_item_id INTEGER NOT NULL REFERENCES costing_items(id) ON DELETE CASCADE,
  PRIMARY KEY (option_id, costing_item_id)
);

CREATE TABLE IF NOT EXISTS service_calcs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  revision_id INTEGER REFERENCES revisions(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  method      TEXT NOT NULL CHECK (method IN ('fixed','rate','percent')),
  rate        REAL,            -- rate method: price per unit of effort
  effort      REAL,            -- rate method: days / engineers / visits...
  effort_unit TEXT,            -- e.g. 'days', 'engineers', 'months'
  percent     REAL,            -- percent method: % of product (capex) total
  amount      REAL NOT NULL DEFAULT 0,  -- fixed method, or computed result snapshot
  costing_item_id INTEGER REFERENCES costing_items(id) ON DELETE SET NULL,
  notes       TEXT,
  created_by  INTEGER NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attachments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  quote_id     INTEGER REFERENCES quotes(id) ON DELETE CASCADE,
  reference    TEXT,            -- vendor's reference number for tracking
  filename     TEXT NOT NULL,
  stored_name  TEXT NOT NULL,   -- on-disk name under DATA_DIR/uploads
  content_type TEXT,
  size         INTEGER,
  uploaded_by  INTEGER NOT NULL REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_activity_project ON activity(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_quotes_project ON quotes(project_id);
CREATE INDEX IF NOT EXISTS idx_revisions_project ON revisions(project_id);
`);

// ---------------------------------------------------------------------------
// Extend costing_items with the full commercial column set (idempotent).
// margin_pct is interpreted as GPM: selling = landed / (1 - GPM).
// ---------------------------------------------------------------------------
function addColumnIfMissing(table: string, column: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

addColumnIfMissing("costing_items", "part_no", "part_no TEXT");
addColumnIfMissing("costing_items", "bom_qty", "bom_qty REAL NOT NULL DEFAULT 1");
addColumnIfMissing("costing_items", "months", "months REAL NOT NULL DEFAULT 1"); // service-term multiplier
addColumnIfMissing("costing_items", "service_terms", "service_terms TEXT");
addColumnIfMissing("costing_items", "list_unit_price", "list_unit_price REAL");
addColumnIfMissing("costing_items", "partner_discount_pct", "partner_discount_pct REAL NOT NULL DEFAULT 0");
addColumnIfMissing("costing_items", "discounted_unit_buy_price", "discounted_unit_buy_price REAL");
addColumnIfMissing("costing_items", "proposal_description", "proposal_description TEXT");
addColumnIfMissing("costing_items", "exch_rate", "exch_rate REAL NOT NULL DEFAULT 1");
addColumnIfMissing("costing_items", "landed_factor", "landed_factor REAL NOT NULL DEFAULT 1");
addColumnIfMissing("costing_items", "sell_override", "sell_override REAL"); // manual selling unit price in AED
addColumnIfMissing("costing_items", "is_amc", "is_amc INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing("costing_items", "is_sw_support", "is_sw_support INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing("costing_items", "item_grouping", "item_grouping TEXT");
addColumnIfMissing("costing_items", "product_grouping", "product_grouping TEXT");
addColumnIfMissing("costing_items", "offer_grouping", "offer_grouping TEXT");
addColumnIfMissing("costing_items", "in_proposal", "in_proposal INTEGER NOT NULL DEFAULT 1");
addColumnIfMissing("costing_items", "map_no", "map_no TEXT");
addColumnIfMissing("costing_items", "auto_map", "auto_map TEXT");
addColumnIfMissing("costing_items", "is_amc_basis", "is_amc_basis INTEGER NOT NULL DEFAULT 0"); // counts toward AMC % base
addColumnIfMissing("service_calcs", "percent_base", "percent_base TEXT NOT NULL DEFAULT 'capex'"); // capex | amc_basis
addColumnIfMissing("costing_items", "apl_unit_price", "apl_unit_price REAL");      // 171H: APL unit price in AED
addColumnIfMissing("costing_items", "apl_discount_pct", "apl_discount_pct REAL NOT NULL DEFAULT 0"); // 171H: extended discount on APL

// ---------------------------------------------------------------------------
// Seed: default admin + default proposal template (placeholder, to be
// designed together) on first run.
// ---------------------------------------------------------------------------
const userCount = db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number };
if (userCount.c === 0) {
  const hash = bcrypt.hashSync("admin123", 10);
  db.prepare(
    "INSERT INTO users (username, password_hash, display_name, email, role) VALUES (?,?,?,?,?)"
  ).run("admin", hash, "Administrator", "admin@local", "admin");
  console.log("[seed] created default admin user (admin / admin123)");
}

const tplCount = db.prepare("SELECT COUNT(*) AS c FROM templates").get() as { c: number };
if (tplCount.c === 0) {
  const defaults = [
    {
      name: "Standard — Unit Price",
      description: "Item / Description / Unit Price / Qty / Total, 5% VAT, amount in words (based on your SBC1K sheet)",
      config: {
        layout: "standard", companyName: "ATCOM", title: "Commercial Proposal",
        vatPct: 5, currencyLabel: "UAE Dirhams", currencyMinor: "Fils",
        showSpecialDiscount: false, specialDiscountPct: 0, amountInWords: true, accentColor: "#1F4E79",
        terms: ["Prices are valid for 30 days unless otherwise stated.", "Delivery as per quoted lead times.", "All prices exclude applicable taxes unless stated."],
      },
      is_default: 1,
    },
    {
      name: "Item Code + Special Discount",
      description: "Adds item-code column and a 'Total after Special Discount' row",
      config: {
        layout: "item_code", companyName: "ATCOM", title: "Commercial Proposal",
        vatPct: 5, currencyLabel: "UAE Dirhams", currencyMinor: "Fils",
        showSpecialDiscount: true, specialDiscountPct: 0, amountInWords: true, accentColor: "#1F4E79",
        terms: ["Prices are valid for 30 days unless otherwise stated."],
      },
      is_default: 0,
    },
    {
      name: "APL / DDP (171H)",
      description: "Shows APL price, discount on APL, and discounted DDP price columns (Etisalat 171H style)",
      config: {
        layout: "apl", companyName: "ATCOM", title: "Commercial Proposal",
        vatPct: 5, currencyLabel: "UAE Dirhams", currencyMinor: "Fils",
        showSpecialDiscount: false, specialDiscountPct: 0, amountInWords: true, accentColor: "#B8860B",
        terms: ["Prices are valid for 30 days unless otherwise stated."],
      },
      is_default: 0,
    },
  ];
  const ins = db.prepare("INSERT INTO templates (module, name, description, config_json, is_default) VALUES ('presales',?,?,?,?)");
  for (const t of defaults) ins.run(t.name, t.description, JSON.stringify(t.config), t.is_default);
  console.log("[seed] created 3 default proposal templates");
}
