/**
 * test-trace: scans test files for US-N references and reports any user
 * stories from PRD §13 that have zero matching tests. Exits non-zero if
 * coverage is below 100% of US-1..US-50.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const TOTAL_US = 101;

const USIDS = Array.from({ length: TOTAL_US }, (_, i) => `US-${i + 1}`);

/** Retired user stories — the feature they described was removed. */
const RETIRED = new Set(['US-16', 'US-17']); // tags, removed in AIAGE-57

const skipDirs = new Set([
  'node_modules',
  'dist',
  '.next',
  'build',
  'coverage',
  'playwright-report',
  'test-results',
  'generated',
  '.git',
]);

const testFilePatterns = [/\.test\.tsx?$/, /\.spec\.tsx?$/, /\/tests?\//];

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (skipDirs.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, files);
    else if (testFilePatterns.some((re) => re.test(full))) files.push(full);
  }
  return files;
}

function main(): void {
  const testFiles = walk(ROOT);
  const found = new Map<string, Set<string>>();
  for (const id of USIDS) found.set(id, new Set());

  for (const file of testFiles) {
    let content: string;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const id of USIDS) {
      const re = new RegExp(`\\b${id}\\b`);
      if (re.test(content)) found.get(id)!.add(file);
    }
  }

  const missing: string[] = [];
  for (const id of USIDS) {
    if (RETIRED.has(id)) continue;
    if (found.get(id)!.size === 0) missing.push(id);
  }

  const expected = TOTAL_US - RETIRED.size;
  const covered = expected - missing.length;
  const pct = ((covered / expected) * 100).toFixed(1);
  process.stdout.write(`US coverage: ${covered}/${expected} (${pct}%, ${RETIRED.size} retired)\n`);

  if (missing.length > 0) {
    process.stdout.write(`Missing tests for: ${missing.join(', ')}\n`);
    process.exit(1);
  }

  process.stdout.write('All user stories have test coverage.\n');
}

main();
