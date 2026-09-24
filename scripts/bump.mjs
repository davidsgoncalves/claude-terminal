// Bumps the version in both manifests. `node scripts/bump.mjs [major|minor|patch]`
import { readFileSync, writeFileSync } from "node:fs";

const FILES = ["package.json", "src-tauri/tauri.conf.json"];
const part = process.argv[2] ?? "patch";
const index = { major: 0, minor: 1, patch: 2 }[part];
if (index === undefined) {
  console.error(`unknown part "${part}"; use major, minor or patch`);
  process.exit(1);
}

const current = JSON.parse(readFileSync(FILES[0], "utf8")).version;
const numbers = current.split(".").map(Number);
numbers[index] += 1;
for (let i = index + 1; i < numbers.length; i++) numbers[i] = 0;
const next = numbers.join(".");

for (const file of FILES) {
  const json = JSON.parse(readFileSync(file, "utf8"));
  json.version = next;
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
}
// The changelog is written by hand; make sure the new version has an entry.
const CHANGELOG = "src/changelog.json";
const log = JSON.parse(readFileSync(CHANGELOG, "utf8"));
const today = new Date().toISOString().slice(0, 10);
const entry = log.find((e) => e.version === next);
if (entry) entry.date = today;
else log.unshift({ version: next, date: today, items: [] });
writeFileSync(CHANGELOG, `${JSON.stringify(log, null, 2)}\n`);

console.log(`${current} -> ${next}`);
if (!entry?.items.length) console.warn(`${CHANGELOG}: write what changed in ${next} before merging`);
