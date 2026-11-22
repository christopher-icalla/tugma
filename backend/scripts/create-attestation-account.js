/**
 * Creates a two-party attestation account on Stellar Testnet.
 *
 * The account gets two signers of weight 1 each, TUGMA's server key and an
 * independent reviewer's key, its master key weight is set to 0, and its low,
 * medium and high thresholds are set to 2. From then on no single key can sign
 * anything for the account: every transaction needs both signatures.
 *
 * Only public keys are passed in. The account's own (master) key is generated
 * in memory, used once to fund and configure the account, and discarded; with
 * weight 0 it could not sign anything anyway. No secret key is ever printed.
 *
 *   node scripts/create-attestation-account.js --tugma-signer G... --reviewer G...
 *   node scripts/create-attestation-account.js --self-test
 *
 * --self-test uses throwaway keys for both signers and proves the setup on
 * Testnet: a transaction signed by one key is rejected and the same
 * transaction signed by both is accepted.
 *
 * Testnet only. HORIZON_URL and FRIENDBOT_URL override the endpoints.
 */
const sdk = require('@stellar/stellar-sdk');

const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
const HORIZON_URL = process.env.HORIZON_URL || 'https://horizon-testnet.stellar.org';
const FRIENDBOT_URL = process.env.FRIENDBOT_URL || 'https://friendbot.stellar.org';

/**
 * Data entries the account writes about itself during setup, so anyone can see
 * on-chain which signer is TUGMA and which is the reviewer (the verifier reads
 * them). Each value is the signer's raw 32-byte ed25519 public key.
 */
const LABELS = Object.freeze({ tugma: 'tugma.signer.tugma', reviewer: 'tugma.signer.reviewer' });
const WEIGHT = 1;
const THRESHOLD = 2;

function assertTestnet(passphrase) {
  if (passphrase !== TESTNET_PASSPHRASE) {
    throw new Error(`Testnet only: the network passphrase must be "${TESTNET_PASSPHRASE}".`);
  }
}

function assertKeys(accountId, tugmaSigner, reviewer) {
  for (const [name, key] of [['TUGMA signer', tugmaSigner], ['reviewer', reviewer]]) {
    if (!sdk.StrKey.isValidEd25519PublicKey(key)) throw new Error(`The ${name} must be a Stellar public key (G...).`);
  }
  if (tugmaSigner === reviewer) throw new Error('TUGMA and the reviewer must use different keys.');
  if (accountId === tugmaSigner || accountId === reviewer) throw new Error('The attestation account must differ from both signer keys.');
}

/**
 * The setup transaction for `account` (an sdk.Account with the current
 * sequence): label both signers, add them with weight 1, then drop the master
 * weight to 0 and raise every threshold to 2. The caller signs it with the
 * account's master key, which is still valid while this transaction is checked.
 */
function buildSetupTransaction({ account, tugmaSigner, reviewer, networkPassphrase, timeoutSeconds = 300 }) {
  assertTestnet(networkPassphrase);
  assertKeys(account.accountId(), tugmaSigner, reviewer);
  return new sdk.TransactionBuilder(account, { fee: sdk.BASE_FEE, networkPassphrase })
    .addOperation(sdk.Operation.manageData({ name: LABELS.tugma, value: sdk.StrKey.decodeEd25519PublicKey(tugmaSigner) }))
    .addOperation(sdk.Operation.manageData({ name: LABELS.reviewer, value: sdk.StrKey.decodeEd25519PublicKey(reviewer) }))
    .addOperation(sdk.Operation.setOptions({ signer: { ed25519PublicKey: tugmaSigner, weight: WEIGHT } }))
    .addOperation(sdk.Operation.setOptions({ signer: { ed25519PublicKey: reviewer, weight: WEIGHT } }))
    .addOperation(sdk.Operation.setOptions({
      masterWeight: 0,
      lowThreshold: THRESHOLD,
      medThreshold: THRESHOLD,
      highThreshold: THRESHOLD,
    }))
    .setTimeout(timeoutSeconds)
    .build();
}

/**
 * Reads an account as Horizon returns it (GET /accounts/:id) and says whether
 * it requires both keys: each has a weight below every threshold, and the two
 * together reach every threshold.
 */
function describeAccount(json, tugmaSigner, reviewer) {
  const weight = (key) => Number(json.signers.find((s) => s.key === key)?.weight ?? 0);
  const t = json.thresholds;
  const thresholds = { low: Number(t.low_threshold), med: Number(t.med_threshold), high: Number(t.high_threshold) };
  const lowest = Math.min(thresholds.low, thresholds.med, thresholds.high);
  const highest = Math.max(thresholds.low, thresholds.med, thresholds.high);
  const label = (name) => {
    const v = json.data?.[name] ?? json.data_attr?.[name];
    try {
      return v ? sdk.StrKey.encodeEd25519PublicKey(Buffer.from(v, 'base64')) : null;
    } catch {
      return null;
    }
  };
  const signers = json.signers.map((s) => ({ key: s.key, weight: Number(s.weight), master: s.key === json.account_id }));
  const keyWeights = signers.map((s) => s.weight);
  return {
    account_id: json.account_id,
    signers,
    thresholds,
    labels: { tugma: label(LABELS.tugma), reviewer: label(LABELS.reviewer) },
    requires_both:
      lowest > 0 &&
      keyWeights.every((w) => w < lowest) &&
      weight(tugmaSigner) + weight(reviewer) >= highest &&
      weight(json.account_id) === 0,
  };
}

// ------------------------------------------------------------------ network

async function fund(accountId) {
  const res = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(accountId)}`);
  if (!res.ok) throw new Error(`Friendbot could not fund ${accountId} (HTTP ${res.status}).`);
}

async function loadJson(accountId) {
  const res = await fetch(`${HORIZON_URL.replace(/\/+$/, '')}/accounts/${accountId}`);
  if (!res.ok) throw new Error(`Horizon could not load ${accountId} (HTTP ${res.status}).`);
  return res.json();
}

const resultCodes = (e) => e?.response?.data?.extras?.result_codes ?? null;

async function createAccount(horizon, tugmaSigner, reviewer) {
  const master = sdk.Keypair.random(); // in memory only; weight 0 after setup
  const accountId = master.publicKey();
  assertKeys(accountId, tugmaSigner, reviewer);
  console.log(`Funding ${accountId} with Friendbot…`);
  await fund(accountId);
  const account = await horizon.loadAccount(accountId);
  const tx = buildSetupTransaction({ account, tugmaSigner, reviewer, networkPassphrase: TESTNET_PASSPHRASE });
  tx.sign(master);
  try {
    const res = await horizon.submitTransaction(tx);
    console.log(`Setup transaction ${res.hash} (ledger ${res.ledger})`);
  } catch (e) {
    throw new Error(`The setup transaction was rejected: ${JSON.stringify(resultCodes(e) ?? e.message)}`);
  }
  return accountId;
}

function printAccount(d) {
  console.log('');
  console.log(`Attestation account  ${d.account_id}`);
  console.log('Signers:');
  for (const s of d.signers) {
    const role = s.master ? 'master key' : s.key === d.labels.tugma ? 'TUGMA' : s.key === d.labels.reviewer ? 'reviewer' : 'signer';
    console.log(`  ${s.key}  weight ${s.weight}  (${role})`);
  }
  console.log(`Thresholds           low ${d.thresholds.low} / medium ${d.thresholds.med} / high ${d.thresholds.high}`);
  console.log(`Requires both keys   ${d.requires_both ? 'yes: no single key reaches any threshold' : 'NO'}`);
}

/** A trivial classic transaction from the account, to prove who can sign for it. */
function proofTransaction(account, note) {
  return new sdk.TransactionBuilder(account, { fee: sdk.BASE_FEE, networkPassphrase: TESTNET_PASSPHRASE })
    .addOperation(sdk.Operation.manageData({ name: 'tugma.proof', value: note }))
    .setTimeout(300)
    .build();
}

async function selfTest(horizon) {
  const tugma = sdk.Keypair.random();
  const reviewer = sdk.Keypair.random();
  const accountId = await createAccount(horizon, tugma.publicKey(), reviewer.publicKey());
  const d = describeAccount(await loadJson(accountId), tugma.publicKey(), reviewer.publicKey());
  printAccount(d);
  if (!d.requires_both) throw new Error('The account does not require both keys.');

  console.log('\nProof (throwaway signer keys, never printed):');
  const single = proofTransaction(await horizon.loadAccount(accountId), 'one signature');
  single.sign(tugma);
  try {
    await horizon.submitTransaction(single);
    throw new Error('A transaction signed by TUGMA alone was accepted. The account is not two-party.');
  } catch (e) {
    const codes = resultCodes(e);
    if (!codes) throw e;
    console.log(`  TUGMA key only:      rejected (${codes.transaction}), transaction ${Buffer.from(single.hash()).toString('hex')} never reached a ledger`);
  }
  const both = proofTransaction(await horizon.loadAccount(accountId), 'two signatures');
  both.sign(tugma);
  both.sign(reviewer);
  const res = await horizon.submitTransaction(both);
  console.log(`  TUGMA + reviewer:    accepted, transaction ${res.hash} (ledger ${res.ledger})`);
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--self-test') opts.selfTest = true;
    else if (a === '--tugma-signer') opts.tugmaSigner = argv[++i];
    else if (a === '--reviewer') opts.reviewer = argv[++i];
    else if (a === '-h' || a === '--help') opts.help = true;
    else throw new Error(`Unknown argument ${a}`);
  }
  if (!opts.help && !opts.selfTest && !(opts.tugmaSigner && opts.reviewer)) throw new Error('Give --tugma-signer G... and --reviewer G..., or --self-test.');
  for (const [k, v] of Object.entries(opts)) {
    if (typeof v === 'string' && /^S[A-Z2-7]{55}$/.test(v)) throw new Error(`${k} looks like a secret key. Pass public keys (G...) only.`);
  }
  return opts;
}

async function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help) {
    console.log(require('node:fs').readFileSync(__filename, 'utf8').split('*/')[0].replace(/^\/\*\*\r?\n/, '').replace(/^ \* ?/gm, ''));
    return;
  }
  if (process.env.STELLAR_NETWORK_PASSPHRASE) assertTestnet(process.env.STELLAR_NETWORK_PASSPHRASE);
  const horizon = new sdk.Horizon.Server(HORIZON_URL);
  if (opts.selfTest) return selfTest(horizon);

  const accountId = await createAccount(horizon, opts.tugmaSigner, opts.reviewer);
  const d = describeAccount(await loadJson(accountId), opts.tugmaSigner, opts.reviewer);
  printAccount(d);
  if (!d.requires_both) throw new Error('The account does not require both keys.');
  console.log(`
Next steps
  1. Authorize the account on the attestation contract for your organization
     (contract admin; the opaque org id is under Settings → Stellar Signers):
       ORG=<opaque org id> ./contracts/scripts/authorize-signers.sh ${accountId}
  2. Set these on the API and restart it:
       MULTISIG_ATTESTATION_ACCOUNT=${accountId}
       MULTISIG_REVIEWER_PUBLIC_KEY=${opts.reviewer}
       MULTISIG_TUGMA_SIGNER_SECRET=<secret key of ${opts.tugmaSigner}, from your secret store>
     The reviewer's secret key stays in the reviewer's own wallet.`);
}

module.exports = { LABELS, TESTNET_PASSPHRASE, buildSetupTransaction, describeAccount, parseArgs };

if (require.main === module) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
}
