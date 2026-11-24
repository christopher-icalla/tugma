/** Records the browser verifier checking a valid, a modified and a resealed package against Testnet. Needs Playwright. */
import { chromium } from "playwright";
import { readFileSync, renameSync } from "node:fs";

const dir = new URL("../../docs/validation/", import.meta.url);
const path = (p) => new URL(p, dir).pathname;
const r = JSON.parse(readFileSync(new URL("results.json", dir), "utf8"));
const run = r.runs[0];
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, recordVideo: { dir: path("."), size: { width: 1280, height: 900 } } });
const page = await context.newPage();
const caption = (text) => page.evaluate((t) => {
  let d = document.getElementById("cap");
  if (!d) { d = document.createElement("div"); d.id = "cap"; document.body.append(d); }
  d.style.cssText = "position:fixed;left:0;right:0;bottom:0;padding:16px 24px;background:#0b5cad;color:#fff;font:18px sans-serif;z-index:9";
  d.textContent = t;
}, text);
const wait = (ms) => page.waitForTimeout(ms);
const check = async (file, text, shot) => {
  await caption(text);
  await wait(3000);
  await page.evaluate(() => { document.getElementById("result").hidden = true; });
  await page.setInputFiles("#file", path(file));
  await page.waitForSelector("#result:not([hidden])", { timeout: 60000 });
  await page.locator("#result").scrollIntoViewIfNeeded();
  await wait(9000);
  await page.screenshot({ path: path(shot) });
};
await page.goto("http://localhost:8787/web/");
await caption("TUGMA verifier, recorded by script. The API is not running.");
await wait(5000);
await page.locator("details.settings summary").click();
await page.fill("#contract", r.contract.id);
await caption("Contract set to the Testnet validation contract");
await wait(5000);
await check(`packages/tugma-${run.package_id}.json`, "1. The exported package", "shot-valid.png");
await check("tampered/T1.json", "2. The same package with its exception removed", "shot-tampered.png");
await check("tampered/T2.json", "3. Exception removed, hash rewritten to match", "shot-forged.png");
await check("tampered/T11.json", "4. Forged package attested on a look-alike contract", "shot-lookalike.png");
await page.goto(`https://stellar.expert/explorer/testnet/tx/${run.attest_tx}`).catch(() => {});
await wait(8000);
await page.screenshot({ path: path("shot-explorer.png") });
const video = page.video();
await context.close();
renameSync(await video.path(), path("verification-run.webm"));
await browser.close();
