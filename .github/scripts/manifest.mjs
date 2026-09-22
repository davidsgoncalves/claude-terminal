// Builds the updater manifest from the assets already on the release.
// Each matrix job writing its own latest.json raced, so the file is composed
// once, after every platform has uploaded.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const tag = process.env.TAG;
if (!tag) {
  console.error("TAG is required");
  process.exit(1);
}

const gh = (args) => execFileSync("gh", args, { encoding: "utf8" });

// Asset name suffix -> updater platform key. Linux self-update works from the
// AppImage only; a .deb install has to be replaced by hand.
const PLATFORMS = [
  { suffix: "_aarch64.app.tar.gz", key: "darwin-aarch64" },
  { suffix: "_x64.app.tar.gz", key: "darwin-x86_64" },
  { suffix: ".AppImage", key: "linux-x86_64" },
  // Read by the app itself: the Tauri updater cannot install a package, so a
  // .deb install downloads this and hands it to the system installer.
  { suffix: ".deb", key: "linux-x86_64-deb" },
];

const assets = JSON.parse(gh(["release", "view", tag, "--json", "assets"])).assets.map((a) => a.name);

const dir = "sigs";
mkdirSync(dir, { recursive: true });
gh(["release", "download", tag, "--pattern", "*.sig", "--dir", dir, "--clobber"]);
const signatures = new Map(
  readdirSync(dir).map((f) => [f.replace(/\.sig$/, ""), readFileSync(join(dir, f), "utf8").trim()]),
);

const repo = process.env.GITHUB_REPOSITORY;
const platforms = {};
for (const { suffix, key } of PLATFORMS) {
  const asset = assets.find((name) => name.endsWith(suffix) && !name.endsWith(".sig"));
  if (!asset) {
    console.warn(`no asset for ${key} (${suffix})`);
    continue;
  }
  const signature = signatures.get(asset);
  if (!signature) {
    console.warn(`no signature for ${asset}; skipping ${key}`);
    continue;
  }
  platforms[key] = {
    signature,
    url: `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(asset)}`,
  };
}

if (Object.keys(platforms).length === 0) {
  console.error("no signed artefacts found; refusing to publish an empty manifest");
  process.exit(1);
}

const manifest = {
  version: tag.replace(/^v/, ""),
  notes: "Instaladores para macOS e Linux. O app se atualiza sozinho a partir daqui.",
  pub_date: new Date().toISOString(),
  platforms,
};

writeFileSync("latest.json", `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`manifest for ${tag}: ${Object.keys(platforms).join(", ")}`);
gh(["release", "upload", tag, "latest.json", "--clobber"]);
