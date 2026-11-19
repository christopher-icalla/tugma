/**
 * Canonical JSON used for TUGMA evidence-package hashes: object keys sorted
 * recursively, arrays kept in order, no whitespace, UTF-8. It must stay
 * byte-identical to `canonicalJson` in backend/src/common/util.ts; both are
 * checked against test/vectors.json.
 */
export function canonicalJson(value) {
  const sort = (v) => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => [k, sort(v[k])]),
      );
    }
    return v;
  };
  return JSON.stringify(sort(value));
}
