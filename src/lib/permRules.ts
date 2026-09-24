import { looksDestructive } from "./describe";
import type { PermissionPayload, PermissionRule } from "./types";

/**
 * The rule that would cover this request: a shell command only when it is the
 * exact same command, any other tool as a whole.
 */
export function ruleFor(p: PermissionPayload): PermissionRule | null {
  if (!p.tool_name) return null;
  if (p.tool_name !== "Bash") return { tool: p.tool_name, command: null };
  const command = p.tool_input?.command;
  return typeof command === "string" && command.trim() ? { tool: "Bash", command } : null;
}

export function sameRule(a: PermissionRule, b: PermissionRule): boolean {
  return a.tool === b.tool && a.command === b.command;
}

/** True when a group rule approves the request. Destructive commands never match. */
export function ruleAllows(rules: PermissionRule[] | undefined, p: PermissionPayload): boolean {
  if (!rules?.length || looksDestructive(p.tool_name, p.tool_input)) return false;
  const wanted = ruleFor(p);
  return !!wanted && rules.some((r) => sameRule(r, wanted));
}

export function describeRule(r: PermissionRule): string {
  return r.command ? `${r.tool}: ${r.command}` : `${r.tool} (qualquer uso)`;
}
