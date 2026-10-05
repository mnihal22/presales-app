import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState("");

  useEffect(() => {
    api<{ version: string }>("/api/version").then((v) => setVersion(v.version)).catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(username, password);
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[hsl(258,34%,15%)] via-[hsl(260,30%,11%)] to-[hsl(260,30%,6.5%)] p-4">
      <Card className="w-full max-w-sm shadow-2xl border-t-2 border-t-[hsl(262,45%,62%)]">
        <CardHeader>
          <img src="/logo.png" alt="ATCOM" className="h-8 w-auto self-start mb-3" />
          <CardTitle className="text-xl">Costing &amp; Proposal Hub</CardTitle>
          <CardDescription>Sign in with your company account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Username</label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Password</label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
            {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
            <Button className="w-full bg-primary hover:bg-primary/90" disabled={busy || !username || !password}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
            <div className="text-center text-[10px] text-muted-foreground pt-1">v{version || "…"}</div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
