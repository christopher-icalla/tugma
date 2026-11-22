import { createChainReader } from "../src/chain.js";
import { TESTNET } from "../src/network.js";
import { verifyMany } from "../src/bulk.js";
import { verifyPackage } from "../src/verify.js";
import { batchViewModel, expectedHashFrom, viewModel } from "./view.js";

// The SDK's browser build (loaded by index.html with a pinned integrity hash).
const sdk = globalThis.StellarSdk;
const $ = (id) => document.getElementById(id);

const expectedHash = expectedHashFrom(location.search);
if (expectedHash) $("expected").textContent = `Checking for package ${expectedHash}`;

$("rpc").value = TESTNET.rpcUrl;
$("contract").value = TESTNET.contractId;
$("horizon").value = TESTNET.horizonUrl;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Appends a single package's result (checks, details, versions) to `out`. */
function renderDetails(out, vm) {
  const checks = el("ul", "checks");
  for (const c of vm.checks) checks.append(el("li", c.ok ? "ok" : "fail", `${c.ok ? "✓" : "✗"} ${c.text}`));
  out.append(checks);

  const dl = el("dl");
  for (const [k, v] of vm.details) dl.append(el("dt", null, k), el("dd", "mono", v));
  out.append(dl);

  if (vm.signers) {
    out.append(el("h3", null, vm.signers.title));
    if (vm.signers.account) out.append(el("p", "mono", vm.signers.account));
    const list = el("ul", "checks");
    for (const r of vm.signers.rows) {
      const li = el("li", r.ok ? "ok" : "fail", `${r.ok ? "✓" : "✗"} ${r.text}`);
      li.append(el("span", "mono hash", r.key));
      list.append(li);
    }
    out.append(list, el("p", vm.signers.ok ? "summary" : "warning", vm.signers.verdict));
    if (vm.signers.note) out.append(el("p", null, vm.signers.note));
    if (vm.signers.txLink) {
      const link = el("a", null, "View the attestation transaction on Stellar Expert");
      link.href = vm.signers.txLink;
      link.rel = "noopener noreferrer";
      link.target = "_blank";
      out.append(link);
    }
  }

  if (vm.versions.length) {
    out.append(el("h3", null, "Versions on-chain (newest first)"));
    const list = el("ol", "versions");
    for (const v of vm.versions) {
      const li = el("li", v.current ? "current" : null, v.text);
      li.append(el("span", "mono hash", v.hash));
      list.append(li);
    }
    out.append(list);
    if (vm.versionsOmitted) out.append(el("p", null, `… and ${vm.versionsOmitted} older version(s).`));
  }
  for (const w of vm.warnings) out.append(el("p", "warning", w));
}

function contractLink(href) {
  const link = el("a", null, "View the contract on Stellar Expert");
  link.href = href;
  link.rel = "noopener noreferrer";
  link.target = "_blank";
  return link;
}

function render(vm) {
  const out = $("result");
  out.replaceChildren();
  out.className = vm.valid ? "result valid" : "result invalid";
  out.append(el("h2", null, vm.title), el("p", "summary", vm.summary));
  renderDetails(out, vm);
  out.append(el("p", "limitation", vm.limitation), contractLink(vm.contractLink));
  out.hidden = false;
}

function renderBatch(bvm) {
  const out = $("result");
  out.replaceChildren();
  out.className = bvm.valid ? "result valid" : "result invalid";
  out.append(el("h2", null, bvm.title), el("p", "summary", bvm.summary));
  const list = el("div", "batch");
  for (const row of bvm.rows) {
    const item = el("details", row.valid ? "row ok" : "row fail");
    const summary = el("summary");
    summary.append(el("span", "badge", row.valid ? "VALID" : row.title.replace(/^NOT VALID: /, "")), el("span", "mono name", row.name), el("span", "line", row.line));
    item.append(summary);
    if (row.vm) renderDetails(item, row.vm);
    list.append(item);
  }
  out.append(list);
  const first = bvm.rows.find((r) => r.vm)?.vm;
  if (first) out.append(el("p", "limitation", first.limitation), contractLink(first.contractLink));
  out.hidden = false;
}

function showError(message) {
  const out = $("result");
  out.replaceChildren(el("h2", null, "Could not check this file"), el("p", "summary", message));
  out.className = "result invalid";
  out.hidden = false;
}

function reader() {
  return createChainReader(sdk, {
    rpcUrl: $("rpc").value.trim(),
    contractId: $("contract").value.trim(),
    networkPassphrase: TESTNET.networkPassphrase,
    horizonUrl: $("horizon").value.trim() || TESTNET.horizonUrl,
  });
}

async function check(file) {
  $("status").textContent = `Checking ${file.name} against Stellar Testnet…`;
  $("result").hidden = true;
  try {
    let bundle;
    try {
      bundle = JSON.parse(await file.text());
    } catch {
      showError("The file is not valid JSON.");
      return;
    }
    render(viewModel(await verifyPackage(bundle, reader()), undefined, expectedHash));
  } catch (e) {
    showError(`Soroban RPC could not be reached or returned an error: ${e.message}`);
  } finally {
    $("status").textContent = "";
  }
}

async function checkMany(files) {
  $("status").textContent = `Checking ${files.length} files against Stellar Testnet…`;
  $("result").hidden = true;
  try {
    const entries = [];
    for (const file of files) {
      try {
        entries.push({ name: file.name, bundle: JSON.parse(await file.text()) });
      } catch {
        entries.push({ name: file.name, error: "not valid JSON" });
      }
    }
    renderBatch(batchViewModel(await verifyMany(entries, reader())));
  } catch (e) {
    showError(`Soroban RPC could not be reached or returned an error: ${e.message}`);
  } finally {
    $("status").textContent = "";
  }
}

function handle(fileList) {
  const files = Array.from(fileList ?? []);
  if (files.length === 1) check(files[0]);
  else if (files.length > 1) checkMany(files);
}

$("file").addEventListener("change", (e) => handle(e.target.files));
const drop = $("drop");
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  handle(e.dataTransfer.files);
});
