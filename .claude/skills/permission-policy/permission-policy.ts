/**
 * Claude Code PermissionRequest hook script.
 *
 * Reads a tool-use permission request from stdin, uses Haiku via `claude -p`
 * (headless mode) to decide whether to auto-allow, deny, or defer to the human,
 * and writes the decision JSON to stdout.
 *
 * Permission policy is read from `${cwd}/.claude/PERMISSION_POLICY.md`. If the
 * file is missing, exits with code 1 to fall back to the interactive prompt.
 *
 * On any error, exits with code 1 so Claude Code falls back to the normal
 * interactive permission prompt.
 *
 * Usage:
 *   echo '{"tool_name":"Bash","tool_input":{"command":"ls"}, ...}' | bun .claude/hooks/permission-policy.ts
 */

import { appendFileSync, mkdirSync, readFileSync } from "node:fs"
import { appendFile, mkdir } from "node:fs/promises"
import { join } from "node:path"

type HookInput = {
  session_id: string
  transcript_path: string
  cwd: string
  permission_mode: string
  hook_event_name: string
  tool_name: string
  tool_input: Record<string, unknown>
  tool_use_id: string
}

async function stdinRead(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString("utf-8").trim()
}

const LOG_DIR = join(process.cwd(), ".claude", "logs")
const LOG_PATH = join(LOG_DIR, "permission-policy.log")

async function ensureLogDir() {
  await mkdir(LOG_DIR, { recursive: true })
}

async function log(message: string) {
  try {
    await ensureLogDir()
    await appendFile(LOG_PATH, `${message}\n`)
  } catch {
    // don't break the hook if logging doesn't work
  }
}

/** Synchronous log for error paths — guarantees the write completes before process.exit(). */
function logSync(message: string) {
  try {
    mkdirSync(LOG_DIR, { recursive: true })
    appendFileSync(LOG_PATH, `${message}\n`)
  } catch {
    // don't break the hook if logging doesn't work
  }
}

function formatField(label: string, value: string): string {
  return `${label}:`.padEnd(16) + value
}

function timestamp(): string {
  return new Date().toISOString().replace("T", " ").replace("Z", "")
}

function readPermissionPolicy(cwd: string): string {
  const policyPath = join(cwd, ".claude", "PERMISSION_POLICY.md")
  try {
    return readFileSync(policyPath, "utf-8")
  } catch (err) {
    const code =
      err instanceof Error && "code" in err
        ? (err as NodeJS.ErrnoException).code
        : undefined
    if (code === "ENOENT") {
      throw new Error(
        `Permission policy not found at ${policyPath}. Run /permission-policy to create one.`,
      )
    }
    throw err
  }
}

/** Run `claude -p` with the given prompt and return the parsed JSON response. */
async function callClaude(prompt: string): Promise<{ behavior: "allow" | "deny" | "ask"; reasoning: string }> {
  const proc = Bun.spawn(["claude", "-p", "--model", "haiku", "--output-format", "json"], {
    stdin: Buffer.from(prompt),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, CLAUDECODE: "" },
  })
  const stdout = await new Response(proc.stdout).text()
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text()
    throw new Error(`claude -p exited with code ${exitCode}: ${stderr.slice(0, 500)}`)
  }

  // claude --output-format json returns a JSON object with a "result" field
  const parsed = JSON.parse(stdout)
  const text: string = parsed.result ?? parsed.text ?? stdout

  // Extract JSON from the response text
  const jsonMatch = typeof text === "string" ? text.match(/\{[\s\S]*?"behavior"[\s\S]*?\}/) : null
  if (jsonMatch) {
    const decision = JSON.parse(jsonMatch[0])
    if (decision.behavior === "allow" || decision.behavior === "deny" || decision.behavior === "ask") {
      return decision
    }
  }

  // Fallback: look for deny/allow/ask keywords
  const lower = typeof text === "string" ? text.toLowerCase() : ""
  if (lower.includes('"deny"') || lower.includes("deny")) {
    return { behavior: "deny", reasoning: typeof text === "string" ? text.slice(0, 200) : "denied" }
  }
  if (lower.includes('"allow"') || lower.includes("allow")) {
    return { behavior: "allow", reasoning: typeof text === "string" ? text.slice(0, 200) : "allowed" }
  }

  // Default to ask (safe fallback)
  return { behavior: "ask", reasoning: typeof text === "string" ? text.slice(0, 200) : "unable to parse response" }
}

export async function main() {
  const startTime = Date.now()
  logSync(`[${timestamp()}]`)

  const raw = await stdinRead()
  if (!raw) {
    throw new Error("No input received on stdin")
  }

  let input: HookInput
  try {
    input = JSON.parse(raw)
  } catch {
    throw new Error(`Failed to parse stdin as JSON: ${raw.slice(0, 200)}`)
  }

  const toolInputLines = Object.entries(input.tool_input)
    .map(([key, value]) => formatField(key, typeof value === "string" ? value : JSON.stringify(value)))

  await log(
    [
      formatField("tool", input.tool_name),
      ...toolInputLines,
      formatField("cwd", input.cwd),
    ].join("\n"),
  )

  const permissionPolicy = readPermissionPolicy(input.cwd)

  const prompt = `You are a security gate for a coding assistant's tool use. You evaluate each tool invocation and decide whether to allow or defer to the human.

PERMISSION POLICY:

${permissionPolicy}

---

Evaluate the following tool invocation and respond with ONLY a JSON object (no other text):
{"behavior": "allow" or "deny" or "ask", "reasoning": "brief explanation"}

- "allow" means the tool use is safe and should proceed automatically.
- "deny" means the tool use violates policy and should be blocked outright.
- "ask" means it is uncertain or potentially dangerous and should defer to the human.

Tool: ${input.tool_name}
Input: ${JSON.stringify(input.tool_input, null, 2)}
Working directory: ${input.cwd}
Permission mode: ${input.permission_mode}`

  const decision = await callClaude(prompt)

  const elapsed = Math.round((Date.now() - startTime) / 1000)

  await log(
    "\n" +
    [
      formatField("decision", decision.behavior.toUpperCase()),
      formatField("reason", decision.reasoning),
      formatField("elapsed", `${elapsed}s`),
    ].join("\n") + "\n",
  )

  const output = {
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: {
        behavior: decision.behavior,
        ...(decision.behavior === "deny" ? { message: decision.reasoning } : {}),
      },
    },
  }

  console.log(JSON.stringify(output))
}

if (import.meta.main) {
  main().then(
    () => process.exit(0),
    (err) => {
      const stack = err instanceof Error ? err.stack : String(err)
      logSync(`[${timestamp()}] ERROR: ${stack}\n`)
      process.exit(1)
    },
  )

  process.on("SIGTERM", () => {
    logSync(`[${timestamp()}] KILLED BY TIMEOUT (SIGTERM)`)
    process.exit(1)
  })
}
