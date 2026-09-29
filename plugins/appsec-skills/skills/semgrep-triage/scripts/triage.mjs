#!/usr/bin/env node
// Helpers for the semgrep-triage report.
//
//   node triage.mjs findings <semgrep.json>   list the findings to triage
//   node triage.mjs embed <report.md>         insert or refresh trace diagrams
//   node triage.mjs check <report.md>         check the report's structure
//
// Run from the repository root.
//
// embed: after a line `<!-- trace: <id> -->`, inserts the Mermaid block from
// docs/traces/<id>.md (replacing the block already there), so the report always
// shows the diagram the source-to-sink generator produced.

import fs from 'node:fs';
import path from 'node:path';

const [command, file] = process.argv.slice(2);
const root = process.cwd();

if (command === 'findings') listFindings(file);
else if (command === 'embed') embed(file);
else if (command === 'check') check(file);
else {
  console.error('usage: triage.mjs findings <semgrep.json> | embed <report.md> | check <report.md>');
  process.exit(2);
}

function listFindings(jsonFile) {
  const scan = JSON.parse(fs.readFileSync(jsonFile ?? 'semgrep.json', 'utf8'));
  const results = scan.results ?? [];
  console.log(`${results.length} findings (semgrep ${scan.version ?? '?'})\n`);
  results.forEach((result, index) => {
    const meta = result.extra?.metadata ?? {};
    const short = result.check_id.split('.').pop();
    console.log(`${index + 1}. ${short} · ${result.path}:${result.start.line} · ${result.extra?.severity}`);
    console.log(`   rule: ${result.check_id}`);
    console.log(`   semgrep metadata: impact ${meta.impact ?? '?'}, likelihood ${meta.likelihood ?? '?'}, confidence ${meta.confidence ?? '?'}`);
    if (meta.cwe) console.log(`   cwe: ${[].concat(meta.cwe).join('; ')}`);
    if (meta.vulnerability_class) console.log(`   class: ${[].concat(meta.vulnerability_class).join('; ')}`);
    console.log(`   message: ${(result.extra?.message ?? '').replace(/\s+/g, ' ').slice(0, 200)}`);
  });
}

function embed(reportFile) {
  const report = fs.readFileSync(reportFile, 'utf8');
  let count = 0;
  const missing = [];
  const updated = report.replace(
    /(<!-- trace: ([a-z0-9-]+) -->\n)(\n?```mermaid\n[\s\S]*?```\n)?/g,
    (whole, marker, id) => {
      const page = path.join(root, 'docs/traces', `${id}.md`);
      if (!fs.existsSync(page)) {
        missing.push(id);
        return whole;
      }
      const block = fs.readFileSync(page, 'utf8').match(/```mermaid\n[\s\S]*?```\n/);
      if (!block) {
        missing.push(id);
        return whole;
      }
      count++;
      return `${marker}\n${block[0]}`;
    },
  );
  fs.writeFileSync(reportFile, updated);
  console.log(`✓ embedded ${count} trace diagram(s)`);
  if (missing.length) {
    console.error(`✗ no generated page for: ${missing.join(', ')} (run the source-to-sink build first)`);
    process.exit(1);
  }
}

function check(reportFile) {
  const report = fs.readFileSync(reportFile, 'utf8');
  const problems = [];

  report.split('\n').forEach((line, index) => {
    if (/^\s*\|.*\|\s*$/.test(line)) problems.push(`line ${index + 1}: tables are not allowed, use lists`);
  });
  if (!/^## Summary$/m.test(report)) problems.push('missing "## Summary"');
  if (/<!-- trace: [a-z0-9-]+ -->\n(?!\n?```mermaid)/.test(report)) {
    problems.push('a trace marker has no diagram after it: run triage.mjs embed');
  }

  const sections = report.split(/^## /m).slice(1).filter((section) => /^F\d+ · /.test(section));
  if (!sections.length) problems.push('no finding sections ("## F1 · ...")');

  const common = [
    '- **Rule:**', '- **Location:**', '- **Threat:**', '- **Verdict:**', '- **Severity:**', '- **Confidence:**',
    '**Evidence**', '> [!example]- Evidence (Manual Reproduction)',
  ];
  const dataflow = ['**Sink:**', '**Inputs reaching it**', '**Source-to-sink trace**', '**Controls on the path**', '**Wiki checks**'];
  const truePositive = ['**Assessment**', '**Suggested fix**', '- **Change:**', '- **Code** (suggestion, not applied):', '- **Why it holds:**', '- **Verify:**'];
  const dismissed = ['**Would become', '**Rule decision: disable the rule?**', '- **Decision:**'];

  for (const section of sections) {
    const title = section.split('\n')[0];
    const where = `"${title}"`;
    const need = (items) => items.filter((item) => !section.includes(item)).forEach((item) => problems.push(`${where}: missing ${item}`));
    need(common);

    const noTrace = /\*\*Source-to-sink trace:\*\* none/.test(section);
    if (noTrace) need(['**What the rule checks:**']);
    else need(dataflow);
    if (!noTrace && !/<!-- trace: [a-z0-9-]+ -->/.test(section)) problems.push(`${where}: no <!-- trace: id --> marker for its diagram`);

    const verdict = section.match(/- \*\*Verdict:\*\* (.*)/)?.[1] ?? '';
    if (/true positive/i.test(verdict)) need(truePositive);
    else if (/false positive|not applicable/i.test(verdict)) need(dismissed);
    else problems.push(`${where}: verdict must say "True positive", "False positive" or "Not applicable"`);

    for (const [, tour] of section.matchAll(/`(\.tours\/[^`]+\.tour)`/g)) {
      if (!fs.existsSync(path.join(root, tour))) problems.push(`${where}: ${tour} does not exist`);
    }
  }

  if (problems.length) {
    console.error(problems.map((problem) => `✗ ${problem}`).join('\n'));
    process.exit(1);
  }
  console.log(`✓ ${sections.length} findings, structure OK`);
}
