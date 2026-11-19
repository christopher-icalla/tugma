import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson, sha256 } from './util';

/**
 * The standalone verifier (verifier/) reimplements canonicalJson so it can run
 * without this API. Both are checked against the same vectors, so a change to
 * either that would make exported packages fail to verify breaks a test.
 */
const { vectors } = JSON.parse(readFileSync(join(__dirname, '../../../verifier/test/vectors.json'), 'utf8')) as {
  vectors: { name: string; input: unknown; canonical: string; sha256: string }[];
};

describe('canonicalJson matches the standalone verifier', () => {
  it.each(vectors.map((v) => [v.name, v] as const))('%s', (_name, v) => {
    expect(canonicalJson(v.input)).toBe(v.canonical);
    expect(sha256(v.canonical)).toBe(v.sha256);
  });
});
