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
addColumnIfMissing("costing_items", "mpg_code", "mpg_code TEXT");                  // vendor MPG/product category code (optional)
addColumnIfMissing("costing_items", "row_color", "row_color TEXT");                // human eye-candy row highlight (yellow/green/red/blue/violet/orange)
addColumnIfMissing("costing_items", "disc_sell_override", "disc_sell_override REAL"); // discounted-offer sell unit AED — independent of standard offer
addColumnIfMissing("proposal_options", "discount_display", "discount_display TEXT NOT NULL DEFAULT 'lumpsum'"); // lumpsum | line_item
addColumnIfMissing("projects", "round_sell_up", "round_sell_up INTEGER NOT NULL DEFAULT 0"); // 1 = ROUNDUP sell to whole AED (Excel sheet behavior)
addColumnIfMissing("revisions", "locked_by", "locked_by INTEGER REFERENCES users(id)");
addColumnIfMissing("proposal_options", "discount_mode", "discount_mode INTEGER NOT NULL DEFAULT 0"); // 1 = use discounted buy chain
addColumnIfMissing("proposal_options", "currency", "currency TEXT NOT NULL DEFAULT 'AED'"); // AED | USD
addColumnIfMissing("costing_items", "price_period", "price_period TEXT NOT NULL DEFAULT 'monthly'"); // monthly (× months) | total (annual/whole period)
addColumnIfMissing("quote_items", "list_unit_price", "list_unit_price REAL");       // vendor list price per unit
addColumnIfMissing("quote_items", "extended_buy", "extended_buy REAL");             // line total from the quote sheet — unit = extended / qty
addColumnIfMissing("revisions", "note", "note TEXT");                               // what changed in this revision
addColumnIfMissing("revisions", "committed_at", "committed_at TEXT");               // costing/proposal build marked complete
addColumnIfMissing("revisions", "committed_by", "committed_by INTEGER REFERENCES users(id)");
addColumnIfMissing("proposal_options", "price_view", "price_view TEXT NOT NULL DEFAULT 'unit'"); // unit | monthly | yearly | total
addColumnIfMissing("option_items", "section", "section TEXT");               // custom proposal header (blank = category section)
addColumnIfMissing("option_items", "custom_description", "custom_description TEXT"); // per-option customer-facing redraft

// ---------------------------------------------------------------------------
// Global reusable masters (helpers, never mandatory):
//  - service rate card (man-day rates by code)
//  - support types → default AMC %
//  - vendor MPG discount tables (171H APL discount by MPG code)
// ---------------------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS rate_card (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE,   -- e.g. InstBH
  description TEXT,
  rate_aed    REAL NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS support_types (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,   -- e.g. "8 x 5 onsite with spare"
  amc_pct     REAL NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Per-module role overrides: granular access per app module.
-- role: admin (full control incl. unlock/delete), manager (create/edit/assign),
--       member (work on assigned), viewer (read-only)
CREATE TABLE IF NOT EXISTS module_roles (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module  TEXT NOT NULL,              -- 'presales', future modules plug in here
  role    TEXT NOT NULL CHECK (role IN ('admin','manager','member','viewer')),
  UNIQUE (user_id, module)
);

CREATE TABLE IF NOT EXISTS mpg_discounts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor       TEXT NOT NULL,         -- free text, manually chosen
  mpg          TEXT NOT NULL,         -- e.g. 1P, 2S
  category     TEXT,
  type         TEXT,
  discount_pct REAL NOT NULL DEFAULT 0,  -- % discount on APL (171H)
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (vendor, mpg)
);

-- ATCOM legal entities customers are registered under (Dubai / Abu Dhabi / future)
CREATE TABLE IF NOT EXISTS entities (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

if ((db.prepare("SELECT COUNT(*) c FROM entities").get() as any).c === 0) {
  const ins = db.prepare("INSERT INTO entities (name) VALUES (?)");
  for (const n of ["ATCOM Dubai", "ATCOM Abu Dhabi"]) ins.run(n);
}

// Seed masters from the standard sheet conventions (only if empty)
if ((db.prepare("SELECT COUNT(*) c FROM rate_card").get() as any).c === 0) {
  const ins = db.prepare("INSERT INTO rate_card (code, description, rate_aed) VALUES (?,?,?)");
  const rates: [string, string, number][] = [
    ["InstBH", "Installation during business hours per man day", 2000],
    ["InstNBH", "Installation during non-working hours per man day", 2750],
    ["InstBHMNC", "Installation business hours per man day (MNC)", 2208],
    ["InstNBHMNC", "Installation non-working hours per man day (MNC)", 2944],
    ["SupContC-Hr", "Support out of bundle per man hour (contracted)", 400],
    ["SupNoC-Hr", "Non-contract installation/support per man hour", 600],
    ["SupNoC-MD", "Non-contract installation/support per man day", 3000],
    ["SupNoCMNC-MD", "Non-contract support per man day (MNC)", 3312],
    ["AppDev", "Application development per man day", 3500],
    ["AppDevMNC", "Application development per man day (MNC)", 3680],
  ];
  for (const r of rates) ins.run(...r);
}
if ((db.prepare("SELECT COUNT(*) c FROM support_types").get() as any).c === 0) {
  const ins = db.prepare("INSERT INTO support_types (name, amc_pct) VALUES (?,?)");
  const types: [string, number][] = [
    ["8 x 5 onsite without spare", 8],
    ["8 x 5 remote without spare", 8],
    ["8 x 5 onsite with spare", 12],
    ["24 x 7 onsite without spare", 10],
    ["24 x 7 onsite with spare", 15],
  ];
  for (const t of types) ins.run(...t);
}
if ((db.prepare("SELECT COUNT(*) c FROM mpg_discounts").get() as any).c === 0) {
  const ins = db.prepare("INSERT INTO mpg_discounts (vendor, mpg, category, type, discount_pct) VALUES (?,?,?,?,?)");
  const mpgs: [string, string, string, string, number][] = [
    ["Avaya", "1P", "Product", "Hardware", 62],
    ["Avaya", "2P", "Product", "Software", 67],
    ["Avaya", "3P", "Product", "Peripherals", 59],
    ["Avaya", "4P", "Product", "Hardware-2", 55],
    ["Avaya", "5P", "Product", "Software-2", 46],
    ["Avaya", "7P", "Product", "OEM Products", 17],
    ["Avaya", "8P", "Product", "Video Solutions", 42],
    ["Avaya", "9P", "Product", "SME Solutions", 51],
    ["Avaya", "1S", "Services", "Support Services", 20],
    ["Avaya", "2S", "Services", "Professional Services", -3],
  ];
  for (const m of mpgs) ins.run(...m);
}

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
