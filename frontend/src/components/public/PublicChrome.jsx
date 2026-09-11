import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";

const LINKS = [
  { to: "/how-it-works", label: "How It Works" },
  { to: "/regulatory-intelligence", label: "Regulatory Intelligence" },
  { to: "/controls", label: "Controls" },
  { to: "/stellar", label: "Stellar" },
  { to: "/security", label: "Security" },
  { to: "/contact", label: "Contact" },
];

export function TugmaMark({ className = "" }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="1.5" y="1.5" width="21" height="21" rx="5" stroke="#0ea5e9" strokeWidth="1.5" />
        <path d="M7 8.5h10M12 8.5V17" stroke="#38bdf8" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="12" cy="17" r="1.4" fill="#0ea5e9" />
      </svg>
      <span className="font-heading text-lg font-bold tracking-tight text-slate-50">TUGMA</span>
    </span>
  );
}

export function PublicNav() {
  const [open, setOpen] = React.useState(false);
  const { pathname } = useLocation();

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-[#090d16]/85 backdrop-blur-lg">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link to="/" data-testid="nav-logo" aria-label="TUGMA home">
          <TugmaMark />
        </Link>

        <nav className="hidden items-center gap-7 lg:flex">
          {LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              data-testid={`nav-${l.to.replace("/", "")}`}
              className={`text-sm transition-colors hover:text-sky-300 ${
                pathname === l.to ? "text-sky-300" : "text-slate-300"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link
            to="/login"
            data-testid="nav-login-button"
            className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-200 transition-colors hover:border-sky-500/50 hover:text-sky-300"
          >
            Sign In
          </Link>
          <Link
            to="/how-it-works"
            data-testid="nav-cta-button"
            className="rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-sky-400"
          >
            See How TUGMA Works
          </Link>
        </div>

        <button
          data-testid="nav-mobile-toggle"
          className="text-slate-200 lg:hidden"
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle menu"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-slate-800 bg-[#090d16] px-4 py-4 lg:hidden">
          <div className="flex flex-col gap-3">
            {LINKS.map((l) => (
              <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="py-1 text-sm text-slate-300">
                {l.label}
              </Link>
            ))}
            <Link to="/login" onClick={() => setOpen(false)} className="mt-2 rounded-md border border-slate-700 px-4 py-2 text-center text-sm text-slate-200">
              Sign In
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-slate-800/80 bg-[#070a11]">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-8 md:flex-row">
          <div className="max-w-sm">
            <TugmaMark />
            <p className="mt-4 text-sm leading-relaxed text-slate-400">
              Continuous Payment Control Intelligence. A control and evidence layer connecting
              regulatory requirements to actual operational activity.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 text-sm sm:grid-cols-3">
            <FooterCol title="Product" links={[["How It Works", "/how-it-works"], ["Controls", "/controls"], ["Regulatory Intelligence", "/regulatory-intelligence"]]} />
            <FooterCol title="Trust" links={[["Security", "/security"], ["Stellar", "/stellar"], ["Contact", "/contact"]]} />
            <FooterCol title="Access" links={[["Sign In", "/login"]]} />
          </div>
        </div>
        <div className="mt-10 border-t border-slate-800/60 pt-6 text-xs leading-relaxed text-slate-500">
          <p>
            TUGMA provides regulatory intelligence and control-mapping software. It does not provide
            legal advice, certify compliance, or represent that an organization is approved or certified
            by any government authority. TUGMA is not an AML transaction-monitoring replacement, a
            payment processor, a bank, or a regulator. All data shown is synthetic demonstration data.
          </p>
          <p className="mt-3">© {new Date().getFullYear()} TUGMA. Compliance You Can Prove.</p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }) {
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-widest text-slate-500">{title}</p>
      <ul className="mt-3 space-y-2">
        {links.map(([label, to]) => (
          <li key={to}>
            <Link to={to} className="text-slate-400 transition-colors hover:text-sky-300">{label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
