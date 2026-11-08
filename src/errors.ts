/**
 * What kind of failure an error is, for callers that act on it (the desktop) without reading the message:
 * no course yet, a track toolchain that needs a rebuild, a damaged record, a file changed outside code-learn, or this
 * computer's sandbox, disk or network.
 */
export type ErrorKind = "no-course" | "toolchain-missing" | "damaged" | "changed" | "sandbox" | "disk" | "offline";

/**
 * Which of this computer's problems an infrastructure error is, as a stable code, and its kind. Callers act on the
 * code, never the wording: the desktop in-process, and over MCP, where the tool result's first line is
 * `code-learn:<code>` (mcp.ts). The sandbox's requirements (DESIGN §4.6); a sandbox that failed during a run; the
 * package manager; the disk; the network.
 */
export const INFRA = {
  "no-sandbox": "sandbox",
  "sandbox-blocked": "sandbox",
  "no-user-session": "sandbox",
  "sandbox-root": "sandbox",
  "sandbox-failed": "sandbox",
  "check-timeout": "sandbox",
  "scope-stop": "sandbox",
  "no-micromamba": "sandbox",
  "host-disk": "disk",
  offline: "offline",
  "rate-limit": "offline",
  tls: "offline",
  "network-timeout": "offline",
} as const satisfies Record<string, ErrorKind>;
export type InfraCode = keyof typeof INFRA;

/** An error whose message is safe and useful to show to a learner or an agent. */
export class CodeLearnError extends Error {
  override name = "CodeLearnError";
  constructor(message: string, readonly kind?: ErrorKind, readonly code?: InfraCode) {
    super(message);
  }
}

/** This computer's problem: its kind follows from its code. */
export const infraError = (message: string, code: InfraCode) => new CodeLearnError(message, INFRA[code], code);
