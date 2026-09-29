#!/usr/bin/env node
// Builds and verifies experiment notebooks.
//
//   node notebook.mjs build <cells.md> <out.ipynb> [--kernel deno|python3]
//   node notebook.mjs verify <notebook.ipynb> [--markdown <out.md>]
//
// build: every fenced code block (```ts, ```typescript, ```python) becomes a code
//   cell; the text between code blocks becomes a markdown cell. Put
//   <!-- cell --> on its own line to split markdown into separate cells. The
//   notebook is written with no outputs, so nothing shows until the user runs it.
// verify: runs a copy of the notebook headlessly (jupyter nbconvert), prints what
//   each code cell printed, fails on any error, and checks the saved notebook has
//   no outputs. --markdown also writes a readable copy with the outputs.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [command, ...args] = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

if (command === 'build') build(args[0], args[1], option('--kernel') ?? 'deno');
else if (command === 'verify') verify(args[0], option('--markdown'));
else {
  console.error('usage: notebook.mjs build <cells.md> <out.ipynb> [--kernel deno|python3] | verify <notebook.ipynb> [--markdown <out.md>]');
  process.exit(2);
}

function build(source, out, kernel) {
  const text = fs.readFileSync(source, 'utf8');
  const cells = [];
  const pushMarkdown = (chunk) => {
    for (const part of chunk.split(/^<!-- cell -->$/m)) {
      if (part.trim()) cells.push({ cell_type: 'markdown', metadata: {}, source: part.trim() });
    }
  };
  const fence = /^```(ts|typescript|python|py)\n([\s\S]*?)^```$/gm;
  let last = 0;
  for (const match of text.matchAll(fence)) {
    pushMarkdown(text.slice(last, match.index));
    cells.push({ cell_type: 'code', metadata: {}, execution_count: null, outputs: [], source: match[2].trimEnd() });
    last = match.index + match[0].length;
  }
  pushMarkdown(text.slice(last));
  cells.forEach((cell, i) => { cell.id = `cell-${i}`; });

  const kernels = {
    deno: { kernelspec: { display_name: 'Deno', language: 'typescript', name: 'deno' }, language_info: { name: 'typescript', file_extension: '.ts', mimetype: 'text/x.typescript' } },
    python3: { kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' }, language_info: { name: 'python' } },
  };
  if (!kernels[kernel]) throw new Error(`unknown kernel ${kernel}`);
  fs.writeFileSync(out, JSON.stringify({ cells, metadata: kernels[kernel], nbformat: 4, nbformat_minor: 5 }, null, 1) + '\n');
  const code = cells.filter((c) => c.cell_type === 'code').length;
  console.log(`✓ wrote ${out}: ${cells.length} cells (${code} code), no outputs`);
}

function findJupyter() {
  for (const dir of [...(process.env.PATH ?? '').split(':'), path.join(os.homedir(), '.local/bin')]) {
    const candidate = path.join(dir, 'jupyter');
    if (fs.existsSync(candidate)) return candidate;
  }
  console.error('✗ jupyter not found. Install it (e.g. `pipx install jupyter --include-deps`), and for TypeScript notebooks run `deno jupyter --install`.');
  process.exit(2);
}

function verify(notebook, markdownOut) {
  const saved = JSON.parse(fs.readFileSync(notebook, 'utf8'));
  const problems = [];
  const savedOutputs = saved.cells.reduce((n, c) => n + (c.outputs?.length ?? 0), 0);
  if (savedOutputs) problems.push(`the saved notebook has ${savedOutputs} outputs: rebuild it, or clear them, so the user runs each step`);
  if (saved.cells.some((c) => c.cell_type === 'markdown' && /^\s*\|.*\|\s*$/m.test([].concat(c.source).join('')))) {
    problems.push('a markdown cell contains a table: use lists');
  }

  // Run a copy next to the original, so relative imports resolve the same way.
  const copy = path.join(path.dirname(notebook), `.verify-${path.basename(notebook)}`);
  fs.copyFileSync(notebook, copy);
  const kernel = saved.metadata?.kernelspec?.name ?? 'deno';
  const run = spawnSync(findJupyter(), ['nbconvert', '--to', 'notebook', '--execute', '--inplace',
    `--ExecutePreprocessor.kernel_name=${kernel}`, '--ExecutePreprocessor.timeout=300', copy],
    { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', PATH: `${process.env.PATH}:${path.join(os.homedir(), '.deno/bin')}` } });
  if (!fs.existsSync(copy)) problems.push(`nbconvert failed: ${run.stderr}`);
  const executed = JSON.parse(fs.readFileSync(copy, 'utf8'));
  fs.rmSync(copy, { force: true });

  const show = (s) => s.replace(/\x1b\[0m/g, ']]').replace(/\x1b\[[0-9;]*m/g, '[[');
  executed.cells.forEach((cell, index) => {
    if (cell.cell_type !== 'code') return;
    const first = [].concat(cell.source).join('').split('\n')[0];
    const printed = (cell.outputs ?? []).filter((o) => o.output_type === 'stream').map((o) => [].concat(o.text).join('')).join('').trimEnd();
    for (const o of cell.outputs ?? []) {
      if (o.output_type === 'error') problems.push(`cell ${index} (${first}): ${o.ename}: ${o.evalue}`);
    }
    console.log(`── cell ${index}: ${first}`);
    if (printed) console.log(show(printed).replace(/^/gm, '   '));
  });

  if (markdownOut) {
    const plain = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
    const lines = [];
    for (const cell of executed.cells) {
      const src = [].concat(cell.source).join('');
      if (cell.cell_type === 'markdown') { lines.push(src, ''); continue; }
      const lang = kernel === 'python3' ? 'python' : 'ts';
      lines.push('```' + lang, src, '```', '');
      const printed = (cell.outputs ?? []).filter((o) => o.output_type === 'stream').map((o) => [].concat(o.text).join('')).join('').trimEnd();
      if (printed) lines.push('```', plain(printed), '```', '');
    }
    fs.writeFileSync(markdownOut, lines.join('\n'));
    console.log(`✓ wrote ${markdownOut}`);
  }

  if (problems.length) {
    console.error(problems.map((p) => `✗ ${p}`).join('\n'));
    process.exit(1);
  }
  console.log('✓ every cell ran without errors; the saved notebook has no outputs');
}
