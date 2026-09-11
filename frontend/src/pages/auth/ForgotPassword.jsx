import React from "react";
import { Link } from "react-router-dom";
import { api, formatApiErrorDetail } from "@/lib/api";
import { TugmaMark } from "@/components/public/PublicChrome";
import { Loader2 } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = React.useState("");
  const [done, setDone] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/forgot-password", { email: email.trim() });
      setDone(true);
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
        <h1 className="mt-8 font-heading text-2xl font-semibold text-slate-100">Reset your password</h1>
        {done ? (
          <div data-testid="forgot-success" className="mt-6 rounded-lg border border-slate-800 bg-slate-900/50 p-6 text-sm text-slate-300">
            If that email is registered, a reset link has been sent. The link expires in one hour.
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4" data-testid="forgot-form">
            <p className="text-sm text-slate-400">Enter your account email and we'll send a reset link.</p>
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              data-testid="forgot-email" placeholder="you@organization.com"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition-colors focus:border-sky-500"
            />
            {error && <p className="text-sm text-rose-300">{error}</p>}
            <button type="submit" disabled={loading} data-testid="forgot-submit" className="flex w-full items-center justify-center gap-2 rounded-md bg-sky-500 px-4 py-2.5 text-sm font-medium text-slate-950 transition-colors hover:bg-sky-400 disabled:opacity-60">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />} Send reset link
            </button>
          </form>
        )}
        <Link to="/login" className="mt-6 block text-center text-xs text-slate-500 hover:text-slate-300">← Back to sign in</Link>
      </div>
    </div>
  );
}
