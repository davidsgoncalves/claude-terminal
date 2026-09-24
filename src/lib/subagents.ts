import type { HookEvent, Subagent } from "./types";

/** The tool Claude Code starts a subagent with; older versions called it Task. */
const AGENT_TOOLS = new Set(["Agent", "Task"]);

/** A background subagent whose end was never matched drops out after this. */
export const SUBAGENT_MAX_AGE_MS = 30 * 60_000;

/**
 * Applies one hook event to a tab's running subagents. A foreground subagent
 * is bracketed by the tool call itself; a background one returns right away,
 * so it stays until a SubagentStop, matched oldest first since the event does
 * not name which subagent ended.
 */
export function nextSubagents(list: Subagent[], e: HookEvent): Subagent[] {
  const p = e.payload;
  const name = String(p.hook_event_name ?? "");
  const tool = typeof p.tool_name === "string" ? p.tool_name : "";
  const id = typeof p.tool_use_id === "string" ? p.tool_use_id : null;
  const fresh = list.filter((s) => e.received_at - s.startedAt < SUBAGENT_MAX_AGE_MS);

  if (name === "PreToolUse" && AGENT_TOOLS.has(tool) && id) {
    const input = (p.tool_input ?? {}) as Record<string, unknown>;
    const text = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : null);
    return [
      ...fresh.filter((s) => s.id !== id),
      {
        id,
        description: text("description") ?? "subagente",
        type: text("subagent_type"),
        background: input.run_in_background === true,
        startedAt: e.received_at,
      },
    ];
  }
  if (name === "PostToolUse" && AGENT_TOOLS.has(tool) && id) {
    return fresh.filter((s) => s.id !== id || s.background);
  }
  if (name === "SubagentStop") {
    const oldest = fresh.find((s) => s.background);
    return oldest ? fresh.filter((s) => s !== oldest) : fresh;
  }
  // A finished turn cannot leave a foreground subagent running.
  if (name === "Stop") return fresh.filter((s) => s.background);
  if (name === "SessionEnd") return [];
  return fresh === list ? list : fresh;
}
