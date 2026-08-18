import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

function candidateFiles(): string[] {
  const output = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" });
  return output.split("\0").filter(Boolean);
}

function isForbiddenSubmissionPath(file: string): boolean {
  const normalized = file.replaceAll("\\", "/");
  const base = path.posix.basename(normalized);

  if (normalized === ".env.example") return false;
  if (base === ".env" || base.startsWith(".env.")) return true;
  if (normalized.startsWith(".data/")) return true;
  if (normalized.includes("/node_modules/") || normalized.startsWith("node_modules/")) return true;
  if (normalized.includes("/.next/") || normalized.startsWith(".next/")) return true;
  if (normalized.includes("/coverage/") || normalized.startsWith("coverage/")) return true;
  if (/\.(sqlite|sqlite-shm|sqlite-wal|db|db-shm|db-wal|zip|log)$/i.test(base)) return true;
  return false;
}

const files = candidateFiles();
const problems: string[] = [];

for (const file of files) {
  if (isForbiddenSubmissionPath(file)) {
    problems.push(`forbidden submission artifact: ${file}`);
    continue;
  }

  const absolute = path.resolve(file);
  if (!fs.existsSync(absolute)) continue;
  const stat = fs.statSync(absolute);
  if (!stat.isFile() || stat.size > 1_000_000) continue;

  const ext = path.extname(file).toLowerCase();
  const textLike = new Set([
    "", ".md", ".txt", ".json", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".css", ".yml", ".yaml",
  ]);
  if (!textLike.has(ext)) continue;

  const text = fs.readFileSync(absolute, "utf8");
  const browserOpenAIKeyName = ["NEXT", "PUBLIC", "OPENAI", "API", "KEY"].join("_");
  if (text.includes(browserOpenAIKeyName)) {
    problems.push(`browser-exposed OpenAI credential name found in ${file}`);
  }

  const keyMatch = text.match(/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/);
  if (keyMatch) {
    problems.push(`possible OpenAI secret found in ${file}`);
  }
}

if (problems.length > 0) {
  console.error("Submission audit failed:");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  console.log(`Submission audit passed: ${files.length} tracked/untracked submission files inspected.`);
  console.log("No candidate env secrets, runtime databases, build artifacts, ZIP bundles, or obvious OpenAI keys found.");
}
