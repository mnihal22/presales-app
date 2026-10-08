import { Fragment, useEffect, useState } from "react";
import { api, downloadFile } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileSpreadsheet, FileText, FileDown } from "lucide-react";

const PRICE_VIEWS = [
  { key: "", label: "Option default" },
  { key: "unit", label: "Unit price (as costed)" },
  { key: "monthly", label: "Per month" },
  { key: "yearly", label: "Per year" },
  { key: "total", label: "Total period" },
];

// Proposal tab: the full customer-facing BOQ rendered in the web UI — exactly
// what the Excel/Word/PDF exports produce (same server-side builder).
export default function ProposalTab({ projectId, revision }: any) {
  const [options, setOptions] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selected, setSelected] = useState<string>("revision"); // "revision" | option id
  const [templateId, setTemplateId] = useState<string>("");
  const [priceView, setPriceView] = useState<string>("");
  const [boq, setBoq] = useState<any>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<any[]>(`/api/options/project/${projectId}`).then(setOptions).catch(console.error);
    api<any[]>("/api/templates").then((rows) => {
      setTemplates(rows);
      const def = rows.find((r) => r.is_default);
      if (def) setTemplateId((prev) => prev || String(def.id));
    }).catch(console.error);
  }, [projectId]);

  // Options belonging to the revision being viewed
  const revOptions = options.filter((o) => o.revision_id === revision?.id);
  const selectedOption = selected === "revision" ? null : revOptions.find((o) => String(o.id) === selected);

  // When switching to an option, default the template + price view from it
  useEffect(() => {
    if (selectedOption) {
      if (selectedOption.template_id) setTemplateId(String(selectedOption.template_id));
      setPriceView("");
    }
  }, [selected]);

  const query = () =>
    `${templateId ? `&templateId=${templateId}` : ""}${priceView ? `&priceView=${priceView}` : ""}`;

  const boqUrl = () =>
    selectedOption ? `/api/export/option/${selectedOption.id}/boq?${query()}` : `/api/export/revision/${revision?.id}/boq?${query()}`;

  useEffect(() => {
    if (!revision) return;
    setError("");
    api<any>(boqUrl()).then(setBoq).catch((e) => { setBoq(null); setError(e.message); });
  }, [revision?.id, selected, templateId, priceView]);

  if (!revision) return <div className="py-6 text-muted-foreground">Select a revision in the Costing Sheet tab first.</div>;

  const doExport = async (format: string) => {
    setBusy(format);
    try {
      const base = selectedOption ? `/api/export/option/${selectedOption.id}` : `/api/export/revision/${revision.id}`;
      await downloadFile(`${base}?format=${format}${query()}`, `proposal.${format}`);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-4 pt-3">
      {/* ---- controls ---- */}
      <div className="flex flex-wrap items-end gap-3 rounded-md border bg-card p-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Proposal</label>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="revision">Whole revision — all in-proposal items</SelectItem>
              {revOptions.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Template</label>
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Default template" /></SelectTrigger>
            <SelectContent>
              {templates.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}{t.is_default ? " (default)" : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Price view</label>
          <Select value={priceView || "__default__"} onValueChange={(v) => setPriceView(v === "__default__" ? "" : v)}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRICE_VIEWS.map((v) => <SelectItem key={v.key || "__default__"} value={v.key || "__default__"}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" disabled={!!busy || !boq} onClick={() => doExport("xlsx")}>
            <FileSpreadsheet className="h-4 w-4 mr-1" /> {busy === "xlsx" ? "…" : "Excel"}
          </Button>
          <Button variant="outline" disabled={!!busy || !boq} onClick={() => doExport("docx")}>
            <FileText className="h-4 w-4 mr-1" /> {busy === "docx" ? "…" : "Word"}
          </Button>
          <Button variant="outline" disabled={!!busy || !boq} onClick={() => doExport("pdf")}>
            <FileDown className="h-4 w-4 mr-1" /> {busy === "pdf" ? "…" : "PDF"}
          </Button>
        </div>
      </div>

      {revOptions.length === 0 && selected === "revision" && (
        <p className="text-xs text-muted-foreground">
          No proposal options on {revision.label} yet — showing all in-proposal items. Create options in the Proposal Options tab to build variants.
        </p>
      )}
      {error && <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</div>}

      {/* ---- BOQ ---- */}
      {boq && (() => {
        const descIdx = boq.headers.findIndex((h: string) => h === "Description");
        return (
        <div className="rounded-md border bg-card">
          {/* meta header */}
          <div className="border-b px-5 py-4">
            <div className="text-lg font-bold text-primary">{boq.meta.companyName}</div>
            <div className="text-sm font-semibold">{boq.meta.title}{boq.meta.option ? ` — ${boq.meta.option}` : ""}</div>
            <div className="mt-2 grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-3">
              <div><span className="text-muted-foreground">Customer: </span>{boq.meta.customer}</div>
              <div><span className="text-muted-foreground">Project: </span>{boq.meta.project}</div>
              <div><span className="text-muted-foreground">Revision: </span>{boq.meta.revision}</div>
              <div><span className="text-muted-foreground">Offer date: </span>{boq.meta.offerDate}</div>
              <div><span className="text-muted-foreground">Currency: </span>{boq.meta.currency}</div>
              <div><span className="text-muted-foreground">Account manager: </span>{boq.meta.accountManager}</div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">{boq.template}</Badge>
              {boq.priceView !== "unit" && (
                <Badge variant="secondary" className="bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300">
                  {boq.priceView === "monthly" ? "per month" : boq.priceView === "yearly" ? "per year" : "total period"}
                </Badge>
              )}
              {boq.discountMode && (
                <Badge variant="secondary" className="bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300">
                  discounted offer ({boq.discountDisplay === "line_item" ? "line-by-line" : "lump-sum"})
                </Badge>
              )}
            </div>
          </div>

          {/* table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-primary/5 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  {boq.headers.map((h: string, i: number) => (
                    <th key={i} className={`px-3 py-2.5 ${/price|total/i.test(h) ? "text-right" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {boq.sections.length === 0 && (
                  <tr><td colSpan={boq.headers.length} className="px-4 py-8 text-center text-muted-foreground">
                    No in-proposal items in this selection.
                  </td></tr>
                )}
                {boq.sections.map((sec: any) => (
                  <Fragment key={`s${sec.no}`}>
                    <tr className="bg-muted/60">
                      <td colSpan={boq.headers.length} className="px-3 py-2 font-semibold">{sec.no}.00&nbsp;&nbsp;{sec.label}</td>
                    </tr>
                    {sec.rows.map((row: any, ri: number) => (
                      <tr key={`s${sec.no}r${ri}`} className="hover:bg-accent/50">
                        {row.cells.map((cell: string, ci: number) => (
                          <td key={ci} className={`px-3 py-2 ${/price|total/i.test(boq.headers[ci] || "") ? "text-right whitespace-nowrap" : ""}`}>
                            {cell}
                            {ci === descIdx && row.sources?.length > 0 && (
                              <div className="mt-0.5 text-[11px] normal-case font-normal text-muted-foreground whitespace-normal">
                                ↳ from costing: {row.sources.slice(0, 3).map((s: any) => `#${s.id}${s.mapNo ? ` ${s.mapNo}` : ""} ${s.description}`).join("; ")}
                                {row.sources.length > 3 ? `; +${row.sources.length - 3} more` : ""}
                                {row.sources.length > 1 ? ` (${row.sources.length} costing lines merged)` : ""}
                              </div>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                {boq.totals.map(([label, value]: [string, string], i: number) => (
                  <tr key={i} className="bg-muted/70 font-semibold">
                    <td colSpan={boq.headers.length - 1} className="px-3 py-2 text-right">{label}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{value}</td>
                  </tr>
                ))}
                {boq.amountInWords && (
                  <tr className="bg-muted/40">
                    <td colSpan={boq.headers.length} className="px-3 py-2 text-xs font-medium">{boq.amountInWords}</td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>

          {(boq.footerNote || boq.terms?.length > 0) && (
            <div className="border-t px-5 py-3 text-xs text-muted-foreground space-y-0.5">
              {boq.footerNote && <div className="italic">{boq.footerNote}</div>}
              {boq.terms.map((t: string, i: number) => <div key={i}>• {t}</div>)}
            </div>
          )}
        </div>
        );
      })()}
    </div>
  );
}
