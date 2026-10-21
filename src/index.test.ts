import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { parseEnv, compare, appendMissing, format } from "./index.js";

const EXAMPLE = `# Database connection string
DATABASE_URL=
# Optional
LOG_LEVEL=info
export API_KEY="replace-me"
SECRET='x'
`;

describe("parseEnv", () => {
  it("parses keys, comments, export and quotes", () => {
    const p = parseEnv(EXAMPLE);
    expect(p.entries.map((e) => e.key)).toEqual(["DATABASE_URL", "LOG_LEVEL", "API_KEY", "SECRET"]);
    expect(p.entries[0].comment).toBe("Database connection string");
    expect(p.entries[0].value).toBe("");
    expect(p.entries[2].value).toBe("replace-me");
    expect(p.entries[3].value).toBe("x");
    expect(p.entries[3].line).toBe(6);
  });
  it("strips trailing comments and handles escapes in double quotes", () => {
    const p = parseEnv('A=hello # note\nB="line1\\nline2"\nC=a#b');
    expect(p.entries[0].value).toBe("hello");
    expect(p.entries[1].value).toBe("line1\nline2");
    expect(p.entries[2].value).toBe("a#b");
  });
  it("reports duplicates, last one wins", () => {
    const p = parseEnv("A=1\nB=2\nA=3");
    expect(p.duplicates).toEqual(["A"]);
    expect(p.entries.find((e) => e.key === "A")?.value).toBe("3");
  });
  it("ignores garbage lines", () => {
    expect(parseEnv("not a line\n=novalue\nOK=1").entries.map((e) => e.key)).toEqual(["OK"]);
  });
});

describe("compare", () => {
  const ex = parseEnv(EXAMPLE);
  it("finds missing, empty and extra keys", () => {
    const r = compare(ex, parseEnv("DATABASE_URL=postgres://x\nAPI_KEY=\nSECRET=s\nEXTRA=1"));
    expect(r.missing).toEqual(["LOG_LEVEL"]);
    expect(r.empty).toEqual(["API_KEY"]);
    expect(r.extra).toEqual(["EXTRA"]);
    expect(r.ok).toBe(false);
  });
  it("passes a complete env", () => {
    const r = compare(ex, parseEnv("DATABASE_URL=p\nLOG_LEVEL=debug\nAPI_KEY=k\nSECRET=s\nEXTRA=1"));
    expect(r.ok).toBe(true);
    expect(r.extra).toEqual(["EXTRA"]);
  });
  it("honours optional, allow-empty and fail-on-extra", () => {
    const actual = parseEnv("DATABASE_URL=p\nAPI_KEY=\nSECRET=s\nEXTRA=1");
    expect(compare(ex, actual, { optional: ["LOG_LEVEL", "API_KEY"] }).ok).toBe(true);
    expect(compare(ex, actual, { optional: ["LOG_LEVEL"], failOnEmpty: false }).ok).toBe(true);
    expect(compare(ex, actual, { optional: ["LOG_LEVEL", "API_KEY"], failOnExtra: true }).ok).toBe(false);
  });
  it("fails on duplicates", () => {
    expect(compare(ex, parseEnv("DATABASE_URL=p\nLOG_LEVEL=d\nAPI_KEY=k\nSECRET=s\nSECRET=t")).ok).toBe(false);
  });
});

describe("appendMissing", () => {
  it("adds placeholders with hints", () => {
    const dir = mkdtempSync(join(tmpdir(), "envcheck-"));
    const file = join(dir, ".env");
    writeFileSync(file, "SECRET=s");
    appendMissing(file, parseEnv(EXAMPLE), ["DATABASE_URL", "LOG_LEVEL"]);
    expect(readFileSync(file, "utf8")).toBe("SECRET=s\n# Database connection string\nDATABASE_URL=\n# Optional\nLOG_LEVEL=\n");
  });
});

describe("format", () => {
  it("renders a summary", () => {
    const text = format(".env", { missing: ["A"], empty: ["B"], extra: ["C"], duplicates: [], ok: false });
    expect(text).toBe("✗ .env\n  missing   A\n  empty     B\n  extra (ok) C");
  });
});

describe("cli", () => {
  const dir = mkdtempSync(join(tmpdir(), "envcheck-cli-"));
  writeFileSync(join(dir, ".env.example"), EXAMPLE);
  writeFileSync(join(dir, ".env"), "DATABASE_URL=p\nAPI_KEY=k\nSECRET=s\n");
  const cli = join(process.cwd(), "dist", "cli.js");
  it("exits 1 with a readable report, 0 with --optional", () => {
    const r = spawnSync("node", [cli], { cwd: dir, encoding: "utf8" });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("missing   LOG_LEVEL");
    const ok = execFileSync("node", [cli, "--optional", "LOG_LEVEL", "--json"], { cwd: dir, encoding: "utf8" });
    expect(JSON.parse(ok).ok).toBe(true);
  });
  it("exits 2 when the example is missing", () => {
    expect(spawnSync("node", [cli, "--example", "nope"], { cwd: dir, encoding: "utf8" }).status).toBe(2);
  });
});
