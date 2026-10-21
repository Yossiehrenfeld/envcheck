/**
 * envcheck — compare .env files against a .env.example so a missing variable
 * fails in CI instead of in production. Zero dependencies.
 */
import { readFileSync, appendFileSync, existsSync } from "node:fs";

export interface EnvEntry {
  key: string;
  value: string;
  line: number;
  /** A "# comment" directly above the key, if any (used for hints). */
  comment?: string;
}

export interface ParsedEnv {
  entries: EnvEntry[];
  /** Keys repeated in the same file (last one wins, like dotenv). */
  duplicates: string[];
}

const LINE_RE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/;

function unquote(raw: string): string {
  const v = raw.trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    const inner = v.slice(1, -1);
    return v.startsWith('"') ? inner.replace(/\\n/g, "\n").replace(/\\"/g, '"') : inner;
  }
  // strip trailing unquoted comments: FOO=bar # note
  const hash = v.indexOf(" #");
  return (hash >= 0 ? v.slice(0, hash) : v).trim();
}

/** Parse dotenv-style text. Supports comments, `export KEY=`, quoted values, blank lines. */
export function parseEnv(text: string): ParsedEnv {
  const entries: EnvEntry[] = [];
  const seen = new Map<string, number>();
  const duplicates: string[] = [];
  let pendingComment: string | undefined;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === "") { pendingComment = undefined; continue; }
    if (trimmed.startsWith("#")) { pendingComment = trimmed.replace(/^#\s?/, ""); continue; }
    const m = LINE_RE.exec(line);
    if (!m) { pendingComment = undefined; continue; }
    const key = m[1];
    const entry: EnvEntry = { key, value: unquote(m[2]), line: i + 1 };
    if (pendingComment) entry.comment = pendingComment;
    pendingComment = undefined;
    const prior = seen.get(key);
    if (prior !== undefined) {
      if (!duplicates.includes(key)) duplicates.push(key);
      entries[prior] = entry; // last one wins, keeps first position
    } else {
      seen.set(key, entries.length);
      entries.push(entry);
    }
  }
  return { entries, duplicates };
}

export interface CompareOptions {
  /** Keys allowed to be missing or empty (e.g. optional variables). */
  optional?: string[];
  /** Treat extra keys (in env but not in example) as a problem. Default false. */
  failOnExtra?: boolean;
  /** Treat empty values as a problem. Default true. */
  failOnEmpty?: boolean;
}

export interface CompareResult {
  missing: string[];
  empty: string[];
  extra: string[];
  duplicates: string[];
  ok: boolean;
}

/** Compare an example (the contract) against an actual env file. */
export function compare(example: ParsedEnv, actual: ParsedEnv, options: CompareOptions = {}): CompareResult {
  const optional = new Set(options.optional ?? []);
  const actualMap = new Map(actual.entries.map((e) => [e.key, e.value] as const));
  const exampleKeys = new Set(example.entries.map((e) => e.key));
  const missing: string[] = [];
  const empty: string[] = [];
  for (const { key } of example.entries) {
    if (optional.has(key)) continue;
    if (!actualMap.has(key)) missing.push(key);
    else if (actualMap.get(key) === "") empty.push(key);
  }
  const extra = actual.entries.map((e) => e.key).filter((k) => !exampleKeys.has(k));
  const failOnEmpty = options.failOnEmpty ?? true;
  const ok = missing.length === 0 && (!failOnEmpty || empty.length === 0) && (!options.failOnExtra || extra.length === 0) && actual.duplicates.length === 0;
  return { missing, empty, extra, duplicates: actual.duplicates, ok };
}

export function readEnvFile(path: string): ParsedEnv {
  return parseEnv(readFileSync(path, "utf8"));
}

/** Append placeholder lines for missing keys to an env file (copying the example's comment as a hint). */
export function appendMissing(path: string, example: ParsedEnv, missing: string[]): string[] {
  if (missing.length === 0) return [];
  const byKey = new Map(example.entries.map((e) => [e.key, e] as const));
  const current = existsSync(path) ? readFileSync(path, "utf8") : "";
  const prefix = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
  const lines = missing.map((k) => {
    const ex = byKey.get(k);
    const hint = ex?.comment ? `# ${ex.comment}\n` : "";
    return `${hint}${k}=`;
  });
  appendFileSync(path, prefix + lines.join("\n") + "\n");
  return missing;
}

/** Render a comparison as GitHub-flavoured text with a ✓/✗ summary. */
export function format(name: string, r: CompareResult, failOnExtra = false): string {
  const out: string[] = [];
  out.push(`${r.ok ? "✓" : "✗"} ${name}`);
  for (const k of r.missing) out.push(`  missing   ${k}`);
  for (const k of r.empty) out.push(`  empty     ${k}`);
  for (const k of r.duplicates) out.push(`  duplicate ${k}`);
  for (const k of r.extra) out.push(`  ${failOnExtra ? "extra    " : "extra (ok)"} ${k}`);
  return out.join("\n");
}
