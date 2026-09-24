// Builds the updater manifest from the assets already on the release.
// Each matrix job writing its own latest.json raced, so the file is composed
// once, after every platform has uploaded.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const tag = process.env.TAG;
const repo = process.env.GITHUB_REPOSITORY;
// By id: the release is still a draft, which lookups by tag do not find.
const releaseId = process.env.RELEASE_ID;
if (!tag || !repo || !releaseId) {
  console.error("TAG, GITHUB_REPOSITORY and RELEASE_ID are required");
  process.exit(1);
}

const gh = (args) => execFileSync("gh", args, { encoding: "utf8" });

// Asset name suffix -> updater platform key. Linux self-update works from the
// AppImage only; a .deb install has to be replaced by hand.
const PLATFORMS = [
  // Names set by rename-assets.mjs, which runs first.
  { suffix: "_macOS-Apple-Silicon_atualizacao.app.tar.gz", key: "darwin-aarch64" },
  { suffix: "_macOS-Intel_atualizacao.app.tar.gz", key: "darwin-x86_64" },
  { suffix: ".AppImage", key: "linux-x86_64" },
  // Read by the app itself: the Tauri updater cannot install a package, so a
  // .deb install downloads this and hands it to the system installer.
  { suffix: ".deb", key: "linux-x86_64-deb" },
];

const release = JSON.parse(gh(["api", `repos/${repo}/releases/${releaseId}`]));
const assets = release.assets.map((a) => a.name);

// Signatures are small text files; read each through the assets API.
const signatures = new Map(
  release.assets
    .filter((a) => a.name.endsWith(".sig"))
    .map((a) => [
      a.name.replace(/\.sig$/, ""),
      gh(["api", "-H", "Accept: application/octet-stream", `repos/${repo}/releases/assets/${a.id}`]).trim(),
    ]),
);
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
// gh finds a draft by its tag when uploading, and --clobber replaces a rerun's file.
gh(["release", "upload", tag, "latest.json", "--clobber"]);
