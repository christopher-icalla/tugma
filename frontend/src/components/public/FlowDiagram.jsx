import React from "react";
import { motion } from "framer-motion";

const STEPS = [
  "REGULATION",
  "REQUIREMENT",
  "CONTROL",
  "PAYMENT ACTIVITY",
  "AUTOMATED TEST",
  "EXCEPTION",
  "EVIDENCE",
  "PROOF",
];

// Vertical conceptual flow with a traveling active highlight.
export function FlowDiagram({ steps = STEPS, testid = "flow-diagram" }) {
  const [active, setActive] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setActive((a) => (a + 1) % steps.length), 1200);
    return () => clearInterval(t);
  }, [steps.length]);

  return (
    <div data-testid={testid} className="flex flex-col items-stretch gap-0">
      {steps.map((s, i) => (
        <React.Fragment key={s}>
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
            className={`flex items-center justify-between rounded-md border px-4 py-3 transition-colors duration-500 ${
              active === i
                ? "border-sky-500/60 bg-sky-500/10"
                : "border-slate-800 bg-slate-900/50"
            }`}
          >
            <span
              className={`font-mono text-xs uppercase tracking-widest transition-colors duration-500 ${
                active === i ? "text-sky-300" : "text-slate-400"
              }`}
            >
              {s}
            </span>
            <span
              className={`h-2 w-2 rounded-full transition-colors duration-500 ${
                active === i ? "bg-sky-400" : "bg-slate-700"
              }`}
            />
          </motion.div>
          {i < steps.length - 1 && (
            <div className="flex h-5 items-center justify-start pl-6">
              <span className="h-full w-px bg-slate-700" />
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
