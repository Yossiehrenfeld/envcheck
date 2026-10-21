#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readEnvFile, compare, format, appendMissing } from "./index.js";

const args = process.argv.slice(2);
let example = ".env.example";
const envs: string[] = [];
const optional: string[] = [];
let json = false, fix = false, failOnExtra = false, allowEmpty = false, quiet = false;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const val = () => { const v = args[++i]; if (v === undefined) { console.error(`envcheck: ${a} needs a value`); process.exit(2); } return v; };
  if (a === "--example" || a === "-e") example = val();
  else if (a === "--env") envs.push(val());
  else if (a === "--optional") optional.push(...val().split(","));
  else if (a === "--json") json = true;
  else if (a === "--fix") fix = true;
  else if (a === "--fail-on-extra") failOnExtra = true;
  else if (a === "--allow-empty") allowEmpty = true;
  else if (a === "--quiet" || a === "-q") quiet = true;
  else if (a === "--help" || a === "-h") { help(); process.exit(0); }
  else if (a.startsWith("-")) { console.error(`envcheck: unknown option ${a}`); help(); process.exit(2); }
  else envs.push(a);
}
if (envs.length === 0) envs.push(".env");

function help() {
  console.log(`Usage: envcheck [env files...] [options]

Compares each env file against an example file (default .env.example) and
exits 1 when something is missing, so it can run in CI or a pre-commit hook.

Options:
  -e, --example <file>   The contract file (default: .env.example)
      --env <file>       An env file to check (repeatable; default: .env)
      --optional A,B     Keys allowed to be missing or empty
      --allow-empty      Do not fail on empty values
      --fail-on-extra    Fail when the env has keys the example lacks
      --fix              Append missing keys (as KEY=) to the env file
      --json             Machine-readable output
  -q, --quiet            Only print failures

Exit codes: 0 all good · 1 problems found · 2 usage/file error`);
}

if (!existsSync(example)) { console.error(`envcheck: example file not found: ${example}`); process.exit(2); }
const ex = readEnvFile(example);
let failed = false;
const report: Record<string, unknown> = {};
for (const file of envs) {
  if (!existsSync(file)) { console.error(`envcheck: env file not found: ${file}`); failed = true; report[file] = { error: "not found" }; continue; }
  const r = compare(ex, readEnvFile(file), { optional, failOnExtra, failOnEmpty: !allowEmpty });
  let fixed: string[] = [];
  if (fix && r.missing.length) fixed = appendMissing(file, ex, r.missing);
  report[file] = { ...r, fixed };
  if (!r.ok) failed = true;
  if (!json && (!quiet || !r.ok)) {
    console.log(format(file, r, failOnExtra));
    if (fixed.length) console.log(`  added ${fixed.length} placeholder line(s) to ${file}`);
  }
}
if (json) console.log(JSON.stringify({ example, ok: !failed, files: report }, null, 2));
process.exit(failed ? 1 : 0);
