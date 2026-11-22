#!/usr/bin/env node
// Checks that every example tab on a threat page can be opened with ?stack=<file name>,
// using the same matching as wiki/docs/assets/stack-tabs.js. Run from the repo root.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const docs = 'plugins/appsec-skills/wiki/docs';
const js = readFileSync(join(docs, 'assets/stack-tabs.js'), 'utf8');
const aliases = JSON.parse(
  js.match(/\/\* ALIASES:BEGIN \*\/\s*const ALIASES = (\{[\s\S]*?\});\s*\/\* ALIASES:END \*\//)[1],
);
const norm = (s) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');

let failures = 0;
for (const category of ['business-logic', 'source-to-sink']) {
  const dir = join(docs, 'threats', category);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'index.md')) {
    const text = readFileSync(join(dir, file), 'utf8');
    const tab = /^=== "([^"]+)"\s*\n\s*\n\s+--8<-- "examples\/[^/]+\/([^"/]+)\.md"/gm;
    for (const [, label, stack] of text.matchAll(tab)) {
      if (norm(aliases[stack] ?? stack) !== norm(label)) {
        console.error(`${category}/${file}: ?stack=${stack} does not open the tab "${label}". Add an alias in stack-tabs.js.`);
        failures += 1;
      }
    }
  }
}
if (failures) process.exit(1);
console.log('Every example tab opens with ?stack=<file name>.');
