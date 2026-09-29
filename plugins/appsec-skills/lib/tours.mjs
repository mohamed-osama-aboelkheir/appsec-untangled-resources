// Shared helpers for the skills that generate CodeTour tours from specs
// (code-walkthrough, source-to-sink): pattern anchoring, tour step output,
// spec loading, and the build/check write step.

import fs from 'node:fs';
import path from 'node:path';

// Pins each file's tab, so the next step's file opens in a new tab instead of
// replacing a preview tab.
export const KEEP_EDITOR = 'workbench.action.keepEditor';

export const text = (value) => (Array.isArray(value) ? value.join('\n') : value ?? '');

export function position(content, offset) {
  const lines = content.slice(0, offset).split('\n');
  return { line: lines.length, character: lines[lines.length - 1].length + 1 };
}

// Finds `pattern` in `file` and returns the CodeTour selection for its first
// capture group (or the whole match). The pattern must match exactly once.
export function resolveSelection({ root, where, file, pattern, problems }) {
  if (!pattern) return void problems.push(`${where}: has a file but no pattern`);
  const filePath = path.join(root, file);
  if (!fs.existsSync(filePath)) return void problems.push(`${where}: file not found`);

  const content = fs.readFileSync(filePath, 'utf8');
  let matches;
  try {
    matches = [...content.matchAll(new RegExp(pattern, 'gmd'))];
  } catch (error) {
    return void problems.push(`${where}: invalid regex: ${error.message}`);
  }
  if (matches.length !== 1) {
    return void problems.push(`${where}: pattern matched ${matches.length} times, expected exactly 1`);
  }
  const [start, end] = matches[0].indices[1] ?? matches[0].indices[0];
  return { start: position(content, start), end: position(content, end) };
}

// Returns the text a selection covers, for checks and reports.
export function selectedText(root, file, selection) {
  const lines = fs.readFileSync(path.join(root, file), 'utf8').split('\n');
  const { start, end } = selection;
  if (start.line === end.line) return lines[start.line - 1].slice(start.character - 1, end.character - 1);
  return [
    lines[start.line - 1].slice(start.character - 1),
    ...lines.slice(start.line, end.line - 1),
    lines[end.line - 1].slice(0, end.character - 1),
  ].join('\n');
}

export function tourStep({ title, description, file, pattern, selection }) {
  const step = { title, description: text(description) };
  if (file) {
    step.file = file;
    step.pattern = pattern;
    if (selection) step.selection = selection;
    step.commands = [KEEP_EDITOR];
  }
  return step;
}

export function loadSpecs({ root, dir, suffix, problems, validate }) {
  const absolute = path.join(root, dir);
  if (!fs.existsSync(absolute)) {
    console.error(`no directory: ${dir}`);
    process.exit(2);
  }
  const files = fs.readdirSync(absolute).filter((file) => file.endsWith(suffix)).sort();
  if (!files.length) {
    console.error(`no *${suffix} files in ${dir}`);
    process.exit(2);
  }
  const specs = files.map((file) => {
    try {
      const spec = JSON.parse(fs.readFileSync(path.join(absolute, file), 'utf8'));
      validate(spec, file);
      return spec;
    } catch (error) {
      problems.push(`${file}: ${error.message}`);
      return null;
    }
  }).filter(Boolean);
  return specs.sort((a, b) => (a.order ?? 1) - (b.order ?? 1));
}

// Writes the outputs (build) or reports stale ones (check), then exits.
export function finish({ root, mode, outputs, problems, script }) {
  if (problems.length) {
    console.error(problems.map((problem) => `✗ ${problem}`).join('\n'));
    process.exit(1);
  }
  let stale = 0;
  for (const [file, content] of outputs) {
    const relative = path.relative(root, file);
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (current === content) continue;
    if (mode === 'check') {
      console.error(`✗ ${relative} is out of date: run ${script} build`);
      stale++;
    } else {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
      console.log(`✓ wrote ${relative}`);
    }
  }
  if (mode === 'check') console.log(stale ? '' : `✓ ${outputs.length} files up to date`);
  process.exit(stale ? 1 : 0);
}
