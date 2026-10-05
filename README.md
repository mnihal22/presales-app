# Costing & Proposal Hub — Presales Module

An internal web app for building costing sheets from vendor quotes and generating customer proposals. First module of a larger internal business suite (CRM, AMC, orders, support tickets — coming later).

## Features (this module)

- **Login & roles** — `admin`, `sales`, `presales`. Local accounts today; the auth layer is pluggable so Active Directory / LDAP can be added later (`server/auth.ts`, `AuthProvider` interface).
- **Projects** — created by sales, auto-numbered (`PRJ-YYYY-NNN`), assigned to presales team members, with status tracking (draft → in progress → review → approved → submitted → won/lost).
- **Revisions** — every project has revisioned costing sheets (R1, R2, …). New revisions carry items forward; revisions can be locked.
- **Vendor quotes** — record quotes with line items from any vendor, then import selected items into the costing sheet with a default margin.
- **Costing sheet** — editable grid with cost, margin %, computed sale price, and totals.
- **Tasks** — create/assign tasks per project with priority, due dates, and status; "My Tasks" view per user.
- **Activity log** — every action is recorded; per-project and global feeds; dashboard shows who is working on what.
- **Full commercial costing grid** — buy price (FCR), partner discounts, exchange rate, landed factor → landed AED cost; GPM-based selling prices; optional Etisalat 171H (APL/DDP) pricing per line; quantity × BOM × months (service-term) multiplication
- **Summary page** — buy / landed / sale / GP / GPM totals split across Products (CAPEX), Subscriptions & Support (OPEX), Professional Services, and AMC
- **Proposal options** — multiple variants per project (Option A/B, optional items…); pick which costing items belong to each option; each option renders through its own template
- **Services calculation** — dedicated page pricing professional services / AMC by fixed lump sum, rate × effort, or % of product total; push results straight into the costing sheet
- **Vendor sheet import** — upload vendor Excel/CSV sheets, map columns visually, save the mapping as a reusable vendor format; original files are kept as tracked records with the vendor's reference number
- **Proposal templates & export** — three layouts rebuilt from your existing sheets (Standard unit-price, Item-code + special discount, APL/DDP 171H), with sectioned items, 5% VAT row, and amount-in-words; export to **Excel (.xlsx)**, **Word (.docx)**, or **PDF**.

## Running on your Ubuntu 24.04 VM

### Quickest path (from a GitHub clone)

```bash
git clone <your-repo-url> costing-hub
cd costing-hub
./install.sh              # installs Node.js if needed, deps, builds, creates .env
npm start                 # or: ./install.sh --service  (run as a systemd service)
```

App is then at `http://<vm-ip>:8787` for everyone on the company network. The SQLite database and uploaded vendor sheets live in `./data/` — back up that folder to back up everything.

### Option A — Docker

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2
docker compose up -d --build
```

Data persists in the `app-data` Docker volume.

### Option B — Manual bare metal

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
npm install
npm run build
cp .env.example .env      # edit JWT_SECRET
npm start
```

## First login

A default admin is created on first run:

- **Username:** `admin` — **Password:** `admin123`

Change it immediately: log in, create real users under **Users**, then disable the default admin's password by editing it or creating a new admin and disabling `admin`.

## Roles & permissions

| Capability | Admin | Sales | Presales |
|---|---|---|---|
| Manage users | ✅ | | |
| Create customers | ✅ | ✅ | |
| Create projects / assign team / change status | ✅ | ✅ | |
| View assigned projects, quotes, costing | ✅ | ✅ (all) | ✅ (assigned only) |
| Record quotes, edit costing, create revisions | ✅ | ✅ | ✅ |
| Create/update tasks | ✅ | ✅ | ✅ |
| Manage proposal templates | ✅ | ✅ | |
| Export proposals | ✅ | ✅ | ✅ |

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | HTTP port |
| `DATA_DIR` | `./data` | Where the SQLite database lives |
| `JWT_SECRET` | random per start | Set explicitly so sessions survive restarts |
| `AUTH_PROVIDER` | `local` | Reserved for future `ldap` / Active Directory support |

## Development

```bash
npm run dev:server   # API on :8787
npm run dev          # frontend on :3000 (proxies /api to :8787)
```

## Architecture (ready for future modules)

- `server/` — Node.js + Hono API, better-sqlite3 (SQLite), JWT auth
- `server/db.ts` — schema; core tables (`users`, `customers`, `activity`) are shared by all future modules
- `server/audit.ts` — central activity logger every module writes to
- `src/pages`, `src/components` — React + Tailwind + shadcn/ui frontend
- New modules (CRM, AMC, orders, tickets) plug in as new tables + route files under `server/routes/` and new pages under `src/pages/`
