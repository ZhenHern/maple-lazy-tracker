// PreToolUse hook for the code-reviewer agent. Agent memory gives the reviewer
// Write and Edit, but a reviewer must never change project code, so this
// allows those tools only inside its own memory folder.
// Claude Code passes the tool call as JSON on stdin; exit code 2 blocks the
// call and shows stderr to the agent.
import path from "node:path";
import { fileURLToPath } from "node:url";

const hooksDir = path.dirname(fileURLToPath(import.meta.url));
const memoryDir = path.resolve(hooksDir, "..", "agent-memory", "code-reviewer");

let raw = "";
for await (const chunk of process.stdin) raw += chunk;

let target;
try {
  const input = JSON.parse(raw);
  const file = input.tool_input?.file_path;
  target = file ? path.resolve(input.cwd ?? process.cwd(), file) : null;
} catch {
  target = null;
}

// Windows paths compare case-insensitively.
const normalize = (value) => (process.platform === "win32" ? value.toLowerCase() : value);
const inside =
  target !== null && normalize(target).startsWith(normalize(memoryDir) + path.sep);

if (!inside) {
  process.stderr.write(
    `Blocked: the code reviewer may only write inside ${memoryDir}. ` +
      `Report the change as a finding instead of making it (target: ${target ?? "unknown"}).\n`,
  );
  process.exit(2);
}
