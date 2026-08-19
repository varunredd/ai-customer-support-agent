import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

function candidateFiles(): string[] {
  const output = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" });
  return output.split("\0").filter(Boolean);
}

function isForbiddenRuntimePath(file: string): boolean {
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
  if (isForbiddenRuntimePath(file)) {
    problems.push(`forbidden runtime artifact: ${file}`);
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

  const browserSecretName = text.match(/\bNEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|API_KEY|OPENAI|RESEND|ADMIN|BUSINESS)[A-Z0-9_]*\b/);
  if (browserSecretName) {
    problems.push(`browser-exposed secret-like environment name found in ${file}: ${browserSecretName[0]}`);
  }

  const keyMatch = text.match(/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/);
  if (keyMatch) {
    problems.push(`possible OpenAI secret found in ${file}`);
  }
}

if (problems.length > 0) {
  console.error("Source audit failed:");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  console.log(`Source audit passed: ${files.length} tracked/untracked files inspected.`);
  console.log("No candidate env secrets, browser-exposed secret-like names, runtime databases, build artifacts, ZIP bundles, or obvious OpenAI keys found.");
}
