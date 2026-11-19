import { createChainReader } from "../src/chain.js";
import { TESTNET } from "../src/network.js";
import { verifyPackage } from "../src/verify.js";
import { viewModel } from "./view.js";

// The SDK's browser build (loaded by index.html with a pinned integrity hash).
const sdk = globalThis.StellarSdk;
const $ = (id) => document.getElementById(id);

$("rpc").value = TESTNET.rpcUrl;
$("contract").value = TESTNET.contractId;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function render(vm) {
  const out = $("result");
  out.replaceChildren();
  out.className = vm.valid ? "result valid" : "result invalid";
  out.append(el("h2", null, vm.title), el("p", "summary", vm.summary));

  const checks = el("ul", "checks");
  for (const c of vm.checks) checks.append(el("li", c.ok ? "ok" : "fail", `${c.ok ? "✓" : "✗"} ${c.text}`));
  out.append(checks);

  const dl = el("dl");
  for (const [k, v] of vm.details) dl.append(el("dt", null, k), el("dd", "mono", v));
  out.append(dl);

  for (const w of vm.warnings) out.append(el("p", "warning", w));
  const link = el("a", null, "View the contract on Stellar Expert");
  link.href = vm.contractLink;
  link.rel = "noopener noreferrer";
  link.target = "_blank";
  out.append(el("p", "limitation", vm.limitation), link);
  out.hidden = false;
}

function showError(message) {
  const out = $("result");
  out.replaceChildren(el("h2", null, "Could not check this file"), el("p", "summary", message));
  out.className = "result invalid";
  out.hidden = false;
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
    const reader = createChainReader(sdk, {
      rpcUrl: $("rpc").value.trim(),
      contractId: $("contract").value.trim(),
      networkPassphrase: TESTNET.networkPassphrase,
    });
    render(viewModel(await verifyPackage(bundle, reader)));
  } catch (e) {
    showError(`Soroban RPC could not be reached or returned an error: ${e.message}`);
  } finally {
    $("status").textContent = "";
  }
}

$("file").addEventListener("change", (e) => e.target.files[0] && check(e.target.files[0]));
const drop = $("drop");
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  if (e.dataTransfer.files[0]) check(e.dataTransfer.files[0]);
});
