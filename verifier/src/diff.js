import { canonicalJson } from "./canonical.js";
import { sha256Hex } from "./hash.js";

/** Manifest lists whose entries are `id:content_hash`, so an edit shows as "changed". */
const HASHED = new Set(["evidence"]);

const splitEntry = (entry) => {
  const s = String(entry);
  const i = s.lastIndexOf(":");
  return i > 0 ? [s.slice(0, i), s.slice(i + 1)] : [s, null];
};

function diffList(key, before = [], after = []) {
  if (HASHED.has(key)) {
    const a = new Map(before.map(splitEntry));
    const b = new Map(after.map(splitEntry));
    return {
      added: [...b.keys()].filter((id) => !a.has(id)).sort(),
      removed: [...a.keys()].filter((id) => !b.has(id)).sort(),
      changed: [...b.keys()].filter((id) => a.has(id) && a.get(id) !== b.get(id)).sort()
        .map((id) => ({ id, before: a.get(id), after: b.get(id) })),
    };
  }
  const a = new Set(before.map(String));
  const b = new Set(after.map(String));
  return {
    added: [...b].filter((x) => !a.has(x)).sort(),
    removed: [...a].filter((x) => !b.has(x)).sort(),
    changed: [],
  };
}

/**
 * What differs between two package manifests: entries added to or removed
 * from each list, evidence whose content hash changed, the period and the
 * counts. Works on the manifests alone, so it needs no network.
 */
export function diffManifests(before, after) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].sort();
  const lists = [];
  const fields = [];
  for (const key of keys) {
    const x = before?.[key];
    const y = after?.[key];
    if (key === "period" || (!Array.isArray(x) && !Array.isArray(y))) {
      if (key === "counts" && x && y && typeof x === "object") {
        for (const k of [...new Set([...Object.keys(x), ...Object.keys(y)])].sort()) {
          if (x[k] !== y[k]) fields.push({ field: `counts.${k}`, before: x[k] ?? null, after: y[k] ?? null });
        }
      } else if (canonicalJson(x ?? null) !== canonicalJson(y ?? null)) {
        fields.push({ field: key, before: x ?? null, after: y ?? null });
      }
      continue;
    }
    const d = diffList(key, Array.isArray(x) ? x : [], Array.isArray(y) ? y : []);
    if (d.added.length || d.removed.length || d.changed.length) lists.push({ key, ...d });
  }
  return { identical: !lists.length && !fields.length, lists, fields };
}

/**
 * Compares two exported package files. Each side's hash is recomputed from
 * its manifest; with a chain reader, each side's attestation is looked up
 * too, so the report says which on-chain version each file is.
 */
export async function diffPackages(before, after, chain = null) {
  const side = async (bundle) => {
    if (!bundle || bundle.format !== "tugma.evidence-package" || bundle.manifest == null) return null;
    const hash = await sha256Hex(canonicalJson(bundle.manifest));
    const attestation = chain ? await chain.verify(hash) : undefined;
    return {
      package_id: bundle.package_id ?? null,
      recomputed_hash: hash,
      matches_declared: typeof bundle.canonical_hash === "string" && bundle.canonical_hash.toLowerCase() === hash,
      attestation: attestation === undefined ? undefined : attestation
        ? { version: attestation.version, package_id: attestation.package_id, attested_at: attestation.attested_at, countersigned: !!attestation.verifier }
        : null,
    };
  };
  const a = await side(before);
  const b = await side(after);
  if (!a || !b) return { ok: false, error: `${!a ? "The first" : "The second"} file is not a TUGMA evidence-package export.` };
  return {
    ok: true,
    same_package: a.package_id === b.package_id,
    before: a,
    after: b,
    ...diffManifests(before.manifest, after.manifest),
  };
}
