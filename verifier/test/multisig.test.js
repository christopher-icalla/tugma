import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as sdk from "@stellar/stellar-sdk";
import { createChainReader } from "../src/chain.js";
import { formatResult, formatSigners, main } from "../src/cli.js";
import { checkAttestationSigners, createHorizonSigners, isMultisigAccount } from "../src/multisig.js";
import { auditSigners } from "../src/signers.js";
import { verifyPackage } from "../src/verify.js";
import { viewModel } from "../web/view.js";
import { CONTRACT, exportedPackage, fakeChain } from "./helpers.js";

const P = sdk.Networks.TESTNET;
const real = JSON.parse(readFileSync(new URL("./fixtures/multisig-testnet.json", import.meta.url), "utf8"));
const b64 = (key) => Buffer.from(sdk.StrKey.decodeEd25519PublicKey(key)).toString("base64");

/** A two-party attestation account and its attest transaction, built locally with fresh keys. */
function setup({ thresholds = 2, sign = ["tugma", "reviewer"], hashHex = "ab".repeat(32) } = {}) {
  const keys = { tugma: sdk.Keypair.random(), reviewer: sdk.Keypair.random(), stranger: sdk.Keypair.random() };
  const accountId = sdk.Keypair.random().publicKey();
  const account = {
    account_id: accountId,
    signers: [
      { key: keys.tugma.publicKey(), weight: 1, type: "ed25519_public_key" },
      { key: keys.reviewer.publicKey(), weight: 1, type: "ed25519_public_key" },
      { key: accountId, weight: 0, type: "ed25519_public_key" },
    ],
    thresholds: { low_threshold: thresholds, med_threshold: thresholds, high_threshold: thresholds },
    data: { "tugma.signer.tugma": b64(keys.tugma.publicKey()), "tugma.signer.reviewer": b64(keys.reviewer.publicKey()) },
  };
  const s = (v) => sdk.nativeToScVal(v, { type: "string" });
  const tx = new sdk.TransactionBuilder(new sdk.Account(accountId, "41"), { fee: sdk.BASE_FEE, networkPassphrase: P })
    .addOperation(new sdk.Contract(CONTRACT).call("attest", new sdk.Address(accountId).toScVal(), s("org_x"), s("pkg-x"), s("2026-01-01"), s("2026-01-31"), sdk.xdr.ScVal.scvBytes(Buffer.from(hashHex, "hex"))))
    .setTimeout(86400)
    .build();
  for (const who of sign) tx.sign(keys[who]);
  const transaction = { hash: Buffer.from(tx.hash()).toString("hex"), ledger: 5000, successful: true, source_account: accountId, envelope_xdr: tx.toXDR() };
  const attestation = { attester: accountId, hash: "ab".repeat(32), attested_ledger: 5000, version: 1 };
  return { keys, account, transaction, attestation };
}

const check = (x, over = {}) => checkAttestationSigners(sdk, { ...x, contractId: CONTRACT, networkPassphrase: P, ...over });

test("a real Testnet two-party attestation: both signatures verify against the labelled signers", () => {
  const attestation = { attester: real.account.account_id, hash: real.hash, attested_ledger: real.transaction.ledger };
  const r = checkAttestationSigners(sdk, { account: real.account, transaction: real.transaction, attestation, contractId: real.contract_id, networkPassphrase: P });
  assert.equal(r.status, "TWO_PARTY");
  assert.equal(r.ok, true);
  assert.deepEqual(r.thresholds, { low: 2, med: 2, high: 2 });
  assert.equal(r.signed_weight, 2);
  assert.equal(r.unknown_signatures, 0);
  const labels = Object.fromEntries(r.signers.map((s) => [s.label, s]));
  assert.equal(labels.TUGMA.signed, true);
  assert.equal(labels["Independent reviewer"].signed, true);
  assert.equal(labels.TUGMA.key, sdk.StrKey.encodeEd25519PublicKey(Buffer.from(real.account.data["tugma.signer.tugma"], "base64")));
  assert.ok(!r.signers.some((s) => s.role === "master"), "the master key (weight 0, not signing) is not listed");
});

test("maps each signature to its signer by hint and ed25519 check", () => {
  const x = setup();
  const r = check(x);
  assert.equal(r.status, "TWO_PARTY");
  assert.deepEqual(r.signers.map((s) => [s.label, s.key, s.signed]), [
    ["TUGMA", x.keys.tugma.publicKey(), true],
    ["Independent reviewer", x.keys.reviewer.publicKey(), true],
  ]);
});

test("only one signer, or a stranger's signature, is shown as insufficient", () => {
  const one = check(setup({ sign: ["tugma"] }));
  assert.equal(one.status, "INSUFFICIENT");
  assert.equal(one.ok, false);
  assert.equal(one.signed_weight, 1);
  assert.deepEqual(one.signers.map((s) => s.signed), [true, false]);
  assert.match(one.problems[0], /weigh 1, below the account's threshold of 2/);

  const stranger = check(setup({ sign: ["tugma", "stranger"] }));
  assert.equal(stranger.status, "INSUFFICIENT");
  assert.equal(stranger.unknown_signatures, 1);

  // A forged signature that copies the reviewer's hint still fails the ed25519 check.
  const x = setup({ sign: ["tugma"] });
  const tx = sdk.TransactionBuilder.fromXDR(x.transaction.envelope_xdr, P);
  const forged = sdk.TransactionBuilder.fromXDR(x.transaction.envelope_xdr, P);
  forged.sign(x.keys.stranger);
  const fake = forged.signatures[1];
  tx.signatures.push(new fake.constructor({ hint: x.keys.reviewer.signatureHint(), signature: fake.signature }));
  const r = check({ ...x, transaction: { ...x.transaction, envelope_xdr: tx.toXDR() } });
  assert.equal(r.status, "INSUFFICIENT");
  assert.equal(r.signers.find((s) => s.label === "Independent reviewer").signed, false);
});

test("an account one key can sign for alone is not two-party", () => {
  const r = check(setup({ thresholds: 1, sign: ["tugma", "reviewer"] }));
  assert.equal(r.status, "SINGLE_KEY");
  assert.equal(r.ok, false);
});

test("the transaction must be this attest call, and the network Testnet", () => {
  const x = setup();
  assert.equal(check({ ...x, attestation: { ...x.attestation, hash: "cd".repeat(32) } }).status, "NOT_ATTEST");
  assert.equal(check(x, { contractId: "CBQHNAXSI55GX2GN6D67GK7BHVPSLJUGZQEU7WJ5LKR5PNUCGLIMAO4K" }).status, "NOT_ATTEST");
  assert.equal(check({ ...x, transaction: { ...x.transaction, hash: "00".repeat(32) } }).status, "NOT_ATTEST");
  assert.throws(() => check(x, { networkPassphrase: sdk.Networks.PUBLIC }), /Testnet only/);
});

test("reads the account and finds the attestation transaction on Horizon; skips ordinary wallets", async () => {
  const x = setup();
  const wallet = sdk.Keypair.random().publicKey();
  const urls = [];
  const fetchJson = async (url) => {
    urls.push(url);
    if (url.endsWith(`/accounts/${wallet}`)) return { account_id: wallet, signers: [{ key: wallet, weight: 1, type: "ed25519_public_key" }], thresholds: { low_threshold: 0, med_threshold: 0, high_threshold: 0 } };
    if (url.endsWith(`/accounts/${x.account.account_id}`)) return x.account;
    if (url.includes("/transactions")) {
      const other = setup({ hashHex: "ef".repeat(32) }).transaction; // a different tx in the same ledger
      return { _embedded: { records: [{ ...other, source_account: x.account.account_id }, x.transaction] }, _links: { next: { href: "https://horizon.invalid/next" } } };
    }
    throw new Error(`unexpected ${url}`);
  };
  const signersOf = createHorizonSigners(sdk, { horizonUrl: "https://horizon.invalid/", contractId: CONTRACT, networkPassphrase: P }, fetchJson);
  assert.deepEqual(await signersOf({ attester: wallet, hash: "ab".repeat(32), attested_ledger: 5000 }), { multisig: false });
  const r = await signersOf(x.attestation);
  assert.equal(r.status, "TWO_PARTY");
  assert.equal(r.transaction.hash, x.transaction.hash);
  assert.ok(urls.every((u) => u.startsWith("https://horizon.invalid/")), "only Horizon is contacted");
  assert.equal(isMultisigAccount(x.account), true);

  const reader = createChainReader(sdk, { rpcUrl: "https://rpc.invalid", contractId: CONTRACT, networkPassphrase: P, horizonUrl: "https://horizon.invalid" }, {}, { fetchJson });
  assert.equal((await reader.attestationSigners(x.attestation)).ok, true);
  assert.equal(createChainReader(sdk, { rpcUrl: "https://rpc.invalid", contractId: CONTRACT, networkPassphrase: P }, {}).attestationSigners, undefined);
});

/** fakeChain() whose attester is a two-party account; attestationSigners checks the locally built transaction. */
async function multisigChain(sign) {
  const chain = fakeChain();
  const pkg = await exportedPackage();
  const x = setup({ sign, hashHex: pkg.canonical_hash });
  chain.attest(pkg, { attester: x.account.account_id, attested_ledger: 5000 });
  chain.attestationSigners = async (a) => check({ ...x, attestation: a });
  return { chain, pkg, x };
}

test("verify: a two-party attestation is VALID with both signers shown, and needs no countersignature", async () => {
  const { chain, pkg, x } = await multisigChain(["tugma", "reviewer"]);
  const r = await verifyPackage(pkg, chain);
  assert.equal(r.status, "VALID");
  assert.equal(r.multisig.status, "TWO_PARTY");
  assert.deepEqual(r.warnings, []);
  const text = formatResult(r);
  assert.match(text, /Attestation signers \(multisig account G[A-Z2-7]{55}; thresholds low 2 \/ medium 2 \/ high 2\):/);
  assert.ok(text.includes(`[ok]   TUGMA                 ${x.keys.tugma.publicKey()}  weight 1  signature verified`));
  assert.ok(text.includes(`[ok]   Independent reviewer  ${x.keys.reviewer.publicKey()}  weight 1  signature verified`));
  assert.match(text, /TWO-PARTY: both signers were required \(no single key reaches the threshold of 2\)/);

  const vm = viewModel(r);
  assert.equal(vm.signers.ok, true);
  assert.deepEqual(vm.signers.rows.map((row) => row.key), [x.keys.tugma.publicKey(), x.keys.reviewer.publicKey()]);
  assert.match(vm.signers.verdict, /^Both signers were required/);
  assert.deepEqual(vm.details.find(([k]) => k === "Countersigned"), ["Countersigned", "Not needed: two-party attestation"]);
});

test("verify and signers: one signature is reported as insufficient", async () => {
  const { chain, pkg } = await multisigChain(["tugma"]);
  const r = await verifyPackage(pkg, chain);
  assert.equal(r.status, "VALID"); // the package itself is intact
  assert.equal(r.multisig.status, "INSUFFICIENT");
  assert.ok(r.warnings.some((w) => /Two-party attestation: verified signatures weigh 1/.test(w)));
  assert.ok(r.warnings.includes("This attestation has not been countersigned."));
  assert.match(formatResult(r), /\[FAIL\] Independent reviewer .* no valid signature/);
  assert.equal(viewModel(r).signers.ok, false);

  const audit = await auditSigners(chain, pkg.org, pkg.package_id, { events: false });
  assert.equal(audit.ok, false);
  assert.match(audit.problems[0], /^v1: two-party attestation: verified signatures weigh 1/);
});

test("signers command: a co-signed version passes without a countersignature, and shows both keys", async () => {
  const { chain, pkg, x } = await multisigChain(["tugma", "reviewer"]);
  const audit = await auditSigners(chain, pkg.org, pkg.package_id, { events: false });
  assert.equal(audit.ok, true);
  assert.equal(audit.versions[0].multisig.status, "TWO_PARTY");
  const text = formatSigners(audit);
  assert.match(text, /^OK: all 1 version\(s\) .* signed by two parties/);
  assert.match(text, /two-party attestation: no countersignature needed/);
  assert.ok(text.includes(x.keys.reviewer.publicKey()));

  const out = [];
  const deps = { stdout: (s) => out.push(s), stderr: () => {}, readFile: async () => JSON.stringify(pkg), reader: () => chain };
  assert.equal(await main(["signers", "pkg.json"], deps), 0);
  assert.equal(await main(["pkg.json"], deps), 0);
  assert.match(out.join("\n"), /TWO-PARTY/);
});

test("a Horizon failure is a note, not a failed verification", async () => {
  const chain = fakeChain();
  const pkg = await exportedPackage();
  chain.attest(pkg, { verifier: sdk.Keypair.random().publicKey() });
  chain.attestationSigners = async () => { throw new Error("Horizon 503"); };
  const r = await verifyPackage(pkg, chain);
  assert.equal(r.status, "VALID");
  assert.equal(r.multisig, null);
  assert.ok(r.warnings.some((w) => /could not be read from Horizon: Horizon 503/.test(w)));
});
