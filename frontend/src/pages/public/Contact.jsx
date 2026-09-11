import React from "react";
import { PublicNav, PublicFooter } from "@/components/public/PublicChrome";
import { Section, Eyebrow } from "@/components/public/Primitives";
import { toast } from "sonner";

export default function Contact() {
  const [sent, setSent] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", email: "", organization: "", message: "" });

  const submit = (e) => {
    e.preventDefault();
    setSent(true);
    toast.success("Thanks — your message has been recorded in this demo environment.");
  };

  return (
    <div className="min-h-screen bg-[#090d16]">
      <PublicNav />
      <Section>
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <Eyebrow>Contact</Eyebrow>
            <h1 className="mt-4 font-heading text-4xl font-bold tracking-tight text-slate-50 sm:text-5xl">
              Talk to the TUGMA team.
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-slate-300">
              For payment operators evaluating continuous control intelligence, tell us about your
              regulatory environment and operational systems.
            </p>
            <div className="mt-8 rounded-lg border border-slate-800 bg-slate-900/40 p-5 text-sm text-slate-400">
              <p className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Demo environment</p>
              <p className="mt-2">This form does not send email. Submissions are acknowledged locally for demonstration.</p>
            </div>
          </div>

          <form onSubmit={submit} className="rounded-xl border border-slate-800 bg-slate-900/50 p-6" data-testid="contact-form">
            {sent ? (
              <div data-testid="contact-success" className="flex h-full flex-col items-center justify-center py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-300">✓</div>
                <h3 className="mt-4 font-heading text-lg font-semibold text-slate-100">Message recorded</h3>
                <p className="mt-1 text-sm text-slate-400">Thanks, {form.name || "there"}. We'll be in touch.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {[["name", "Full name", "text"], ["email", "Work email", "email"], ["organization", "Organization", "text"]].map(([k, label, type]) => (
                  <div key={k}>
                    <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-widest text-slate-500">{label}</label>
                    <input
                      required type={type} value={form[k]}
                      onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                      data-testid={`contact-${k}`}
                      className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition-colors focus:border-sky-500"
                    />
                  </div>
                ))}
                <div>
                  <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-widest text-slate-500">Message</label>
                  <textarea
                    required rows={4} value={form.message}
                    onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                    data-testid="contact-message"
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition-colors focus:border-sky-500"
                  />
                </div>
                <button type="submit" data-testid="contact-submit" className="w-full rounded-md bg-sky-500 px-4 py-2.5 text-sm font-medium text-slate-950 transition-colors hover:bg-sky-400">
                  Send message
                </button>
              </div>
            )}
          </form>
        </div>
      </Section>
      <PublicFooter />
    </div>
  );
}
