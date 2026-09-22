import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { formatApiErrorDetail } from "@/lib/api";
import { TugmaMark } from "@/components/public/PublicChrome";
import { Loader2 } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email.trim(), password);
      navigate("/app/dashboard");
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#090d16]">
      <div className="hidden w-1/2 flex-col justify-between border-r border-slate-800 bg-[#070a11] p-12 lg:flex">
        <Link to="/"><TugmaMark /></Link>
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-sky-400">Continuous Payment Control Intelligence</p>
          <h2 className="mt-4 font-heading text-3xl font-bold tracking-tight text-slate-50">Compliance You Can Prove.</h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-400">
            Continuous visibility into payment controls, exceptions and evidence readiness.
          </p>
        </div>
        <p className="font-mono text-[11px] uppercase tracking-widest text-slate-600">
          Synthetic Demonstration Environment — No Production Payment Data
        </p>
      </div>

      <div className="flex w-full items-center justify-center p-6 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="lg:hidden"><Link to="/"><TugmaMark /></Link></div>
          <h1 className="mt-8 font-heading text-2xl font-semibold text-slate-100 lg:mt-0">Sign in to TUGMA</h1>
          <p className="mt-1.5 text-sm text-slate-400">Access the Compliance Control Center.</p>

          <form onSubmit={submit} className="mt-8 space-y-4" data-testid="login-form">
            <div>
              <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-widest text-slate-500">Email</label>
              <input
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                data-testid="login-email"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition-colors focus:border-sky-500"
              />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="block font-mono text-[11px] uppercase tracking-widest text-slate-500">Password</label>
                <Link to="/forgot-password" data-testid="login-forgot-link" className="text-xs text-sky-400 hover:text-sky-300">Forgot password?</Link>
              </div>
              <input
                type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                data-testid="login-password"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition-colors focus:border-sky-500"
              />
            </div>
            {error && <p data-testid="login-error" className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}
            <button type="submit" disabled={loading} data-testid="login-submit" className="flex w-full items-center justify-center gap-2 rounded-md bg-sky-500 px-4 py-2.5 text-sm font-medium text-slate-950 transition-colors hover:bg-sky-400 disabled:opacity-60">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />} Sign In
            </button>
          </form>

          <Link to="/" className="mt-6 block text-center text-xs text-slate-500 hover:text-slate-300">← Back to website</Link>
        </div>
      </div>
    </div>
  );
}
