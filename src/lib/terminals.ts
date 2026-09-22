import type { Terminal } from "@xterm/xterm";

/** Live xterm instances keyed by tab id, so one global pty-data listener can route output. */
export const terminals = new Map<string, Terminal>();

export function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
