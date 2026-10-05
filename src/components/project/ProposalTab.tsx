import { useEffect, useState } from "react";
import { api, downloadFile } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileSpreadsheet, FileText, FileDown } from "lucide-react";

export default function ProposalTab({ revision }: any) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    api<any[]>("/api/templates").then((rows) => {
      setTemplates(rows);
      const def = rows.find((r) => r.is_default);
      if (def) setTemplateId(String(def.id));
    }).catch(console.error);
  }, []);

  if (!revision) return <div className="py-6 text-muted-foreground">Select a revision in the Costing Sheet tab first.</div>;

  const doExport = async (format: string) => {
    setBusy(format);
    try {
      await downloadFile(`/api/export/revision/${revision.id}?format=${format}${templateId ? `&templateId=${templateId}` : ""}`, `proposal.${format}`);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="pt-3">
      <Card className="max-w-xl">
        <CardHeader><CardTitle>Generate customer proposal</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Export the costing sheet of <span className="font-medium text-foreground">{revision.label}</span> as a customer-facing proposal.
          </div>
          <div>
            <label className="text-sm font-medium">Template</label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger>
              <SelectContent>
                {templates.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}{t.is_default ? " (default)" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={!!busy} onClick={() => doExport("xlsx")}>
              <FileSpreadsheet className="h-4 w-4 mr-1" /> {busy === "xlsx" ? "…" : "Excel"}
            </Button>
            <Button variant="outline" disabled={!!busy} onClick={() => doExport("docx")}>
              <FileText className="h-4 w-4 mr-1" /> {busy === "docx" ? "…" : "Word"}
            </Button>
            <Button variant="outline" disabled={!!busy} onClick={() => doExport("pdf")}>
              <FileDown className="h-4 w-4 mr-1" /> {busy === "pdf" ? "…" : "PDF"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
