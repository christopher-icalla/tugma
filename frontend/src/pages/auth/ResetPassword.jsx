import React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, formatApiErrorDetail } from "@/lib/api";
import { TugmaMark } from "@/components/public/PublicChrome";
import { Loader2 } from "lucide-react";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [done, setDone] = React.useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/reset-password", { token, password });
      setDone(true);
      setTimeout(() => navigate("/login"), 1800);
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#090d16] p-6">
      <div className="w-full max-w-sm">
        <Link to="/"><TugmaMark /></Link>
        <h1 className="mt-8 font-heading text-2xl font-semibold text-slate-100">Choose a new password</h1>
        {!token ? (
          <p className="mt-6 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            This reset link is missing its token. Request a new link.
          </p>
        ) : done ? (
          <div data-testid="reset-success" className="mt-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-6 text-sm text-emerald-300">
            Password updated. Redirecting to sign in…
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4" data-testid="reset-form">
            <input
              type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
              data-testid="reset-password" placeholder="New password (min 8 characters)"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition-colors focus:border-sky-500"
            />
            {error && <p className="text-sm text-rose-300">{error}</p>}
            <button type="submit" disabled={loading} data-testid="reset-submit" className="flex w-full items-center justify-center gap-2 rounded-md bg-sky-500 px-4 py-2.5 text-sm font-medium text-slate-950 transition-colors hover:bg-sky-400 disabled:opacity-60">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />} Update password
            </button>
          </form>
        )}
        <Link to="/login" className="mt-6 block text-center text-xs text-slate-500 hover:text-slate-300">← Back to sign in</Link>
      </div>
    </div>
  );
}
