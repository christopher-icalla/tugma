/**
 * Preload for the API-unavailable run (node --import): records every host the
 * process opens a socket to, and refuses hosts outside TUGMA_ALLOWED_HOSTS.
 */
import net from "node:net";
import { appendFileSync } from "node:fs";

const allowed = new Set((process.env.TUGMA_ALLOWED_HOSTS ?? "").split(",").filter(Boolean));
const log = process.env.TUGMA_EGRESS_LOG;
const connect = net.Socket.prototype.connect;

net.Socket.prototype.connect = function (...args) {
  // net.connect() passes its normalized arguments as one array.
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const host = typeof first === "object" ? (first.host ?? first.path ?? "localhost") : typeof args[1] === "string" ? args[1] : "localhost";
  const ok = allowed.has(host);
  if (log) appendFileSync(log, `${JSON.stringify({ host, allowed: ok })}\n`);
  if (!ok) {
    queueMicrotask(() => this.destroy(new Error(`egress guard: ${host} is not allowed`)));
    return this;
  }
  return connect.apply(this, args);
};
