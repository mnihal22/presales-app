// ---------------------------------------------------------------------------
// Shared costing calculation engine — mirrors the Excel costing sheet.
// Quantity basis = qty × bom_qty × months (months = service-term multiplier,
// e.g. 36-month support contracts).
// margin_pct is GPM (gross profit margin on the SELLING price).
// ---------------------------------------------------------------------------

export interface CostingRow {
  id: number;
  revision_id: number;
  quote_item_id: number | null;
  category: string;          // Products (CAPEX) | Subscriptions & Support (OPEX) | Professional Services | AMC
  description: string;
  vendor: string | null;
  qty: number;
  unit_cost: number;         // ATCOM unit buy price (FCR)
  margin_pct: number;        // GPM %
  notes: string | null;
  sort: number;
  part_no: string | null;
  bom_qty: number;
  months: number;
  service_terms: string | null;
  list_unit_price: number | null;
  partner_discount_pct: number;
  discounted_unit_buy_price: number | null;
  proposal_description: string | null;
  exch_rate: number;
  landed_factor: number;
  sell_override: number | null;
  is_amc: number;
  is_sw_support: number;
  item_grouping: string | null;
  product_grouping: string | null;
  offer_grouping: string | null;
  in_proposal: number;
  map_no: string | null;
  auto_map: string | null;
  apl_unit_price: number | null;
  apl_discount_pct: number;
}

export interface ComputedRow extends CostingRow {
  basis: number;                    // qty × bom_qty × months
  ext_list_fcr: number;
  ext_buy_fcr: number;
  ext_disc_buy_fcr: number;
  calc_unit_buy_fcr: number;        // list × (1 − partner discount)
  landed_unit_aed: number;
  landed_total_aed: number;
  selling_unit_aed: number;         // sell_override ?? landed / (1 − GPM)
  selling_total_aed: number;
  gp_aed: number;
  gpm_actual: number;               // fraction, e.g. 0.25
  // Discounted-offer area
  disc_landed_unit_aed: number | null;
  disc_landed_total_aed: number | null;
  disc_selling_unit_aed: number | null;
  disc_selling_total_aed: number | null;
  // 171H / APL area
  apl_total_aed: number | null;
  ddp_unit_aed: number | null;      // APL × (1 − apl discount)
  ddp_total_aed: number | null;
  gpm_on_171h: number | null;
  sell_price_for_summary: number;   // DDP total if present, else selling total
}

const n = (v: number | null | undefined, d = 0) => (v == null || Number.isNaN(v) ? d : Number(v));

export function computeRow(r: CostingRow): ComputedRow {
  const basis = n(r.qty, 1) * n(r.bom_qty, 1) * n(r.months, 1);
  const list = n(r.list_unit_price);
  const buy = n(r.unit_cost);
  const discBuy = r.discounted_unit_buy_price != null ? n(r.discounted_unit_buy_price) : null;
  const gpm = n(r.margin_pct) / 100;
  const exch = n(r.exch_rate, 1);
  const lf = n(r.landed_factor, 1);

  const ext_list_fcr = list * basis;
  const ext_buy_fcr = buy * basis;
  const ext_disc_buy_fcr = discBuy != null ? discBuy * basis : 0;
  const calc_unit_buy_fcr = list * (1 - n(r.partner_discount_pct) / 100);

  const landed_unit_aed = buy * exch * lf;
  const landed_total_aed = landed_unit_aed * basis;

  const selling_unit_aed = r.sell_override != null ? n(r.sell_override) : gpm >= 1 ? 0 : landed_unit_aed / (1 - gpm);
  const selling_total_aed = selling_unit_aed * basis;
  const gp_aed = selling_total_aed - landed_total_aed;
  const gpm_actual = selling_total_aed !== 0 ? gp_aed / selling_total_aed : 0;

  // Discounted offer area (uses discounted buy price, same GPM)
  let disc_landed_unit_aed: number | null = null;
  let disc_landed_total_aed: number | null = null;
  let disc_selling_unit_aed: number | null = null;
  let disc_selling_total_aed: number | null = null;
  if (discBuy != null) {
    disc_landed_unit_aed = discBuy * exch * lf;
    disc_landed_total_aed = disc_landed_unit_aed * basis;
    disc_selling_unit_aed = gpm >= 1 ? 0 : disc_landed_unit_aed / (1 - gpm);
    disc_selling_total_aed = disc_selling_unit_aed * basis;
  }

  // 171H / APL area
  let apl_total_aed: number | null = null;
  let ddp_unit_aed: number | null = null;
  let ddp_total_aed: number | null = null;
  let gpm_on_171h: number | null = null;
  if (r.apl_unit_price != null) {
    const apl = n(r.apl_unit_price);
    apl_total_aed = apl * basis;
    ddp_unit_aed = apl * (1 - n(r.apl_discount_pct) / 100);
    ddp_total_aed = ddp_unit_aed * basis;
    gpm_on_171h = ddp_total_aed !== 0 ? (ddp_total_aed - landed_total_aed) / ddp_total_aed : 0;
  }

  return {
    ...r,
    basis,
    ext_list_fcr,
    ext_buy_fcr,
    ext_disc_buy_fcr,
    calc_unit_buy_fcr,
    landed_unit_aed,
    landed_total_aed,
    selling_unit_aed,
    selling_total_aed,
    gp_aed,
    gpm_actual,
    disc_landed_unit_aed,
    disc_landed_total_aed,
    disc_selling_unit_aed,
    disc_selling_total_aed,
    apl_total_aed,
    ddp_unit_aed,
    ddp_total_aed,
    gpm_on_171h,
    sell_price_for_summary: ddp_total_aed ?? selling_total_aed,
  };
}

export const SUMMARY_CATEGORIES = [
  "Products (CAPEX)",
  "Subscriptions & Support (OPEX)",
  "Professional Services",
  "AMC",
] as const;

export interface CategoryTotals {
  category: string;
  buy_fcr: number;
  landed_aed: number;
  sale_aed: number;
  gp_aed: number;
  gpm: number;
}

export function summarize(rows: ComputedRow[]) {
  const byCat = new Map<string, ComputedRow[]>();
  for (const cat of SUMMARY_CATEGORIES) byCat.set(cat, []);
  for (const r of rows) {
    const cat = SUMMARY_CATEGORIES.includes(r.category as any) ? r.category : "Products (CAPEX)";
    byCat.get(cat)!.push(r);
  }
  const cats: CategoryTotals[] = [];
  for (const [category, items] of byCat) {
    const buy_fcr = items.reduce((s, r) => s + r.ext_buy_fcr, 0);
    const landed_aed = items.reduce((s, r) => s + r.landed_total_aed, 0);
    const sale_aed = items.reduce((s, r) => s + r.sell_price_for_summary, 0);
    const gp_aed = sale_aed - landed_aed;
    cats.push({ category, buy_fcr, landed_aed, sale_aed, gp_aed, gpm: sale_aed !== 0 ? gp_aed / sale_aed : 0 });
  }
  const total: CategoryTotals = {
    category: "Total",
    buy_fcr: cats.reduce((s, c) => s + c.buy_fcr, 0),
    landed_aed: cats.reduce((s, c) => s + c.landed_aed, 0),
    sale_aed: cats.reduce((s, c) => s + c.sale_aed, 0),
    gp_aed: cats.reduce((s, c) => s + c.gp_aed, 0),
    gpm: 0,
  };
  total.gpm = total.sale_aed !== 0 ? total.gp_aed / total.sale_aed : 0;
  return { categories: cats, total };
}

// ---------------------------------------------------------------------------
// Amount in words (English), e.g. for AED proposals:
// "One Hundred Five Thousand Six Hundred Eighteen UAE Dirhams Only"
// ---------------------------------------------------------------------------
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function threeDigits(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (rest >= 20) {
    const t = Math.floor(rest / 10);
    const o = rest % 10;
    parts.push(o ? `${TENS[t]} ${ONES[o]}` : TENS[t]);
  } else if (rest > 0) {
    parts.push(ONES[rest]);
  }
  return parts.join(" ");
}

export function amountInWords(amount: number, major = "UAE Dirhams", minor = "Fils"): string {
  let whole = Math.floor(amount + 1e-9);
  const frac = Math.round((amount - whole) * 100);
  if (whole === 0 && frac === 0) return `No ${major} Only`;

  const scales: [number, string][] = [[1_000_000_000, "Billion"], [1_000_000, "Million"], [1_000, "Thousand"]];
  const parts: string[] = [];
  for (const [scale, name] of scales) {
    if (whole >= scale) {
      parts.push(`${threeDigits(Math.floor(whole / scale))} ${name}`);
      whole %= scale;
    }
  }
  if (whole > 0) parts.push(threeDigits(whole));

  let out = parts.join(" ") + ` ${major}`;
  if (frac > 0) out += ` and ${threeDigits(frac)} ${minor}`;
  return out + " Only";
}
