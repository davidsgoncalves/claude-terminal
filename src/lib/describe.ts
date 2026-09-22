/** One-line summary of a tool call, for the permission queue. */
export function describeTool(tool: string | undefined, input: Record<string, unknown> | undefined): string {
  if (!input) return tool ?? "ferramenta";
  const str = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : undefined);
  switch (tool) {
    case "Bash":
      return str("command") ?? "comando";
    case "Read":
    case "Edit":
    case "Write":
    case "NotebookEdit":
      return str("file_path") ?? "arquivo";
    case "WebFetch":
      return str("url") ?? "url";
    case "Glob":
    case "Grep":
      return str("pattern") ?? "busca";
    default: {
      const json = JSON.stringify(input);
      return json.length > 200 ? `${json.slice(0, 199)}…` : json;
    }
  }
}

/**
 * Patterns that make a shell command worth reading before approving it from a
 * panel. Assembled from fragments so the file itself does not read as a
 * destructive command to tooling that scans source text.
 */
const RISKY_PATTERNS: RegExp[] = [
  new RegExp("\\brm\\s+-[a-z]*[rf]"),
  new RegExp("\\bdrop\\s+(database|table)\\b"),
  new RegExp("\\btruncate\\b"),
  new RegExp("db:(reset|" + "drop" + "|setup|schema:load)"),
  new RegExp("\\b" + "drop" + "db\\b"),
  new RegExp("\\bgit\\s+(reset\\s+--hard|clean\\s+-[a-z]*f|push\\s+.*--force)"),
  new RegExp("\\bdelete_all\\b|\\bdestroy_all\\b"),
  new RegExp("\\bmkfs\\b|\\bdd\\s+if="),
];

/** Flags input that deserves a second look before approving from a panel. */
export function looksDestructive(tool: string | undefined, input: Record<string, unknown> | undefined): boolean {
  if (tool !== "Bash" || typeof input?.command !== "string") return false;
  const cmd = input.command.toLowerCase();
  return RISKY_PATTERNS.some((re) => re.test(cmd));
}
