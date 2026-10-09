#!/usr/bin/env node
/**
 * No-AI policy check (runs in CI).
 *
 * TUGMA's compliance and evidence-attestation workflow is deterministic: control
 * evaluation, mapping, explanations, exception handling, remediation, evidence
 * processing, hashing, attestation and verification are all rule-based code. No
 * AI, LLM or machine-learning model may participate, because a cryptographic
 * integrity proof is only meaningful if the data behind it is produced
 * reproducibly.
 *
 * This script fails the build if an AI/ML library appears anywhere in the
 * dependency trees (direct or transitive), or if source code calls a hosted
 * AI API or reads an AI provider's credentials. Run it locally with:
 *
 *   node scripts/check-no-ai.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

/** AI / LLM / ML libraries (npm and Rust crates). */
const PACKAGES = [
  "openai", "@azure/openai", "@anthropic-ai/sdk", "@anthropic-ai/bedrock-sdk", "@google/generative-ai", "@google/genai",
  "@google-cloud/aiplatform", "@google-cloud/vertexai", "langchain", "llamaindex", "cohere-ai", "@mistralai/mistralai",
  "groq-sdk", "together-ai", "replicate", "ollama", "ai", "@xenova/transformers", "@huggingface/inference",
  "@huggingface/transformers", "@tensorflow/tfjs", "@tensorflow/tfjs-node", "onnxruntime-node", "onnxruntime-web",
  "brain.js", "ml5", "synaptic", "natural", "@pinecone-database/pinecone", "chromadb", "@aws-sdk/client-bedrock-runtime",
  "@aws-sdk/client-sagemaker-runtime",
];
const PACKAGE_PREFIXES = ["@langchain/", "@ai-sdk/", "@llamaindex/", "@modelcontextprotocol/"];
const CRATES = ["async-openai", "openai-api-rs", "llm", "candle-core", "tch", "ort", "tract-onnx", "rust-bert", "linfa"];

/** Hosted AI endpoints and provider credentials that must not appear in source. */
const SOURCE_PATTERNS = [
  /api\.openai\.com/i, /api\.anthropic\.com/i, /generativelanguage\.googleapis\.com/i, /aiplatform\.googleapis\.com/i,
  /api\.cohere\.(ai|com)/i, /api\.mistral\.ai/i, /api\.groq\.com/i, /openrouter\.ai/i, /api\.together\.(xyz|ai)/i,
  /api-inference\.huggingface\.co/i, /bedrock-runtime\./i, /openai\.azure\.com/i,
  /\b(OPENAI|ANTHROPIC|GEMINI|GOOGLE_GENAI|COHERE|MISTRAL|GROQ|OPENROUTER|HUGGINGFACE|HF)_API_KEY\b/,
];

const SOURCE_DIRS = ["backend/src", "backend/prisma", "frontend/src", "contracts/contracts", "contracts/scripts", "scripts"];
const SOURCE_EXT = /\.(m?[jt]sx?|rs|sh|py|prisma|sql|json|ya?ml)$/;
const SELF = "scripts/check-no-ai.mjs";

const problems = [];
const isAiPackage = (name) => PACKAGES.includes(name) || PACKAGE_PREFIXES.some((p) => name.startsWith(p));

// --- npm: package.json (direct) and package-lock.json (transitive)
for (const dir of ["backend", "frontend"]) {
  const pkgPath = join(ROOT, dir, "package.json");
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
      for (const name of Object.keys(pkg[field] ?? {})) {
        if (isAiPackage(name)) problems.push(`${dir}/package.json ${field}: ${name}`);
      }
    }
  }
  const lockPath = join(ROOT, dir, "package-lock.json");
  if (existsSync(lockPath)) {
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    for (const key of Object.keys(lock.packages ?? {})) {
      const name = key.split("node_modules/").pop();
      if (name && isAiPackage(name)) problems.push(`${dir}/package-lock.json: ${name} (transitive)`);
    }
  }
  const yarnPath = join(ROOT, dir, "yarn.lock");
  if (existsSync(yarnPath)) {
    for (const line of readFileSync(yarnPath, "utf8").split("\n")) {
      if (/^\s/.test(line) || !line.includes("@")) continue; // only package header lines
      for (const spec of line.replace(/:$/, "").split(",")) {
        const s = spec.trim().replace(/^"|"$/g, "");
        const name = s.startsWith("@") ? `@${s.slice(1).split("@")[0]}` : s.split("@")[0];
        if (isAiPackage(name)) problems.push(`${dir}/yarn.lock: ${name} (transitive)`);
      }
    }
  }
}

// --- Rust: Cargo.toml and Cargo.lock
for (const file of ["contracts/Cargo.lock", "contracts/Cargo.toml", "contracts/contracts/attestation/Cargo.toml"]) {
  const p = join(ROOT, file);
  if (!existsSync(p)) continue;
  const text = readFileSync(p, "utf8");
  for (const crate of CRATES) {
    const re = file.endsWith(".lock") ? new RegExp(`^name = "${crate}"$`, "m") : new RegExp(`^${crate}\\s*=`, "m");
    if (re.test(text)) problems.push(`${file}: ${crate}`);
  }
}

// --- Source code: hosted AI endpoints and credentials
function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    if (["node_modules", "target", "build", "dist", "test_snapshots"].includes(entry)) return [];
    const p = join(dir, entry);
    return statSync(p).isDirectory() ? walk(p) : SOURCE_EXT.test(entry) ? [p] : [];
  });
}
for (const dir of SOURCE_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    if (rel === SELF) continue;
    const text = readFileSync(file, "utf8");
    for (const re of SOURCE_PATTERNS) if (re.test(text)) problems.push(`${rel}: matches ${re}`);
  }
}

if (problems.length) {
  console.error("No-AI policy violated. TUGMA's compliance and evidence workflow must stay deterministic:\n");
  for (const p of problems) console.error(`  - ${p}`);
  console.error("\nRemove the AI dependency or call. See README → Deterministic by design.");
  process.exit(1);
}
console.log("No-AI policy: OK (no AI/ML libraries in any dependency tree, no hosted AI APIs in source).");
