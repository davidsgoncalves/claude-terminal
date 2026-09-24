// Renames the release assets so the list says which file is for which system.
// tauri-action names them after the Rust target, which means nothing to
// someone picking a download.
import { execFileSync } from "node:child_process";

const tag = process.env.TAG;
const repo = process.env.GITHUB_REPOSITORY;
if (!tag || !repo) {
  console.error("TAG and GITHUB_REPOSITORY are required");
  process.exit(1);
}
const version = tag.replace(/^v/, "");
const base = `Claude-Terminal_${version}`;

const gh = (args) => execFileSync("gh", args, { encoding: "utf8" });

// Original suffix -> new name without the optional ".sig".
const RULES = [
  { match: /_aarch64\.dmg$/, name: `${base}_macOS-Apple-Silicon.dmg` },
  { match: /_x64\.dmg$/, name: `${base}_macOS-Intel.dmg` },
  { match: /_aarch64\.app\.tar\.gz$/, name: `${base}_macOS-Apple-Silicon_atualizacao.app.tar.gz` },
  { match: /_x64\.app\.tar\.gz$/, name: `${base}_macOS-Intel_atualizacao.app.tar.gz` },
  { match: /\.AppImage$/, name: `${base}_Linux.AppImage` },
  { match: /\.deb$/, name: `${base}_Linux-Debian-Ubuntu.deb` },
];

const release = JSON.parse(gh(["api", `repos/${repo}/releases/tags/${tag}`]));
for (const asset of release.assets) {
  if (asset.name.startsWith(base)) continue;
  const sig = asset.name.endsWith(".sig");
  const plain = sig ? asset.name.slice(0, -4) : asset.name;
  const rule = RULES.find((r) => r.match.test(plain));
  if (!rule) continue;
  const name = sig ? `${rule.name}.sig` : rule.name;
  gh(["api", "-X", "PATCH", `repos/${repo}/releases/assets/${asset.id}`, "-f", `name=${name}`]);
  console.log(`${asset.name} -> ${name}`);
}
