#!/usr/bin/env node
// Builds source-to-sink dataflow traces: a Mermaid flowchart of code cards, one
// chain per source, and a CodeTour that follows the cards in order.
//
//   node trace.mjs build [tracesDir]   write .tours/source-to-sink-*.tour and <tracesDir>/*.md
//   node trace.mjs check [tracesDir]   exit 1 if outputs are stale or a spec is invalid
//
// Run from the repository root. tracesDir defaults to docs/traces. Each
// <tracesDir>/<id>.trace.json produces .tours/source-to-sink-<order>-<id>.tour and
// <tracesDir>/<id>.md. The spec format is documented in ../references/trace-spec.md.

import path from 'node:path';
import { finish, loadSpecs, resolveSelection, selectedText, text, tourStep } from '../../../lib/tours.mjs';

const [mode = 'build', tracesDir = 'docs/traces'] = process.argv.slice(2);
if (!['build', 'check'].includes(mode)) {
  console.error('usage: trace.mjs build|check [tracesDir]');
  process.exit(2);
}

const root = process.cwd();
const problems = [];
const warnings = [];

const ORIGINS = {
  user: { dot: '🔴', name: 'user input', stroke: '#d93025', fill: '#fde2e1' },
  config: { dot: '🔵', name: 'config', stroke: '#1a73e8', fill: '#e8f0fe' },
  constant: { dot: '⚪', name: 'constant', stroke: '#607d8b', fill: '#eceff1' },
  identity: { dot: '🟢', name: 'authenticated identity', stroke: '#188038', fill: '#e6f4ea' },
  stored: { dot: '🟣', name: 'stored data', stroke: '#8e24aa', fill: '#f3e5f5' },
  external: { dot: '🟠', name: 'external service', stroke: '#e8710a', fill: '#fef3e6' },
};
const ROLES = ['source', 'hop', 'stop', 'sink', 'control', 'gap'];
const ROLE_ICONS = { gap: '🚫', control: '🛡', stop: '✋', sink: '⚠️' };

const shortPath = (file) => file.replace(/^src\//, '');
// Escapes code for a quoted Mermaid label, then turns **value** into bold.
const label = (value) =>
  String(value)
    .replace(/[#;"<>]/g, (c) => ({ '#': '#35;', ';': '#59;', '"': '#quot;', '<': '#lt;', '>': '#gt;' })[c])
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\n/g, '<br/>');
const plain = (value) => String(value ?? '').replace(/\*\*/g, '');

function validate(trace, file) {
  for (const key of ['id', 'title', 'description', 'cards']) {
    if (!trace[key]) problems.push(`${file}: missing "${key}"`);
  }
  const cards = trace.cards ?? [];
  const byN = new Map(cards.map((card) => [card.n, card]));
  const sources = new Map();
  cards.forEach((card, index) => {
    const where = `${file} card ${card.n}`;
    if (card.n !== index + 1) problems.push(`${file}: cards must be numbered 1..N in order (found ${card.n} at position ${index + 1})`);
    if (!ROLES.includes(card.role)) problems.push(`${where}: role must be one of ${ROLES.join(', ')}`);
    if (!card.title) problems.push(`${where}: missing title`);
    if (!card.description) problems.push(`${where}: missing description`);
    if (card.role === 'source') {
      if (!ORIGINS[card.origin]) problems.push(`${where}: origin must be one of ${Object.keys(ORIGINS).join(', ')}`);
      if (sources.has(card.path)) problems.push(`${where}: path "${card.path}" already has a source (card ${sources.get(card.path)})`);
      sources.set(card.path, card.n);
    }
    if (['hop', 'stop', 'sink'].includes(card.role)) {
      if (card.from !== undefined && !(byN.has(card.from) && card.from < card.n)) {
        problems.push(`${where}: "from" must be the number of an earlier card`);
      }
      for (const p of [].concat(card.path)) {
        if (!sources.has(p) && card.from === undefined) {
          problems.push(`${where}: path "${p}" has no source card before it (or use "from" to branch off another card)`);
        }
        if (!sources.has(p)) sources.set(p, card.n);
      }
    }
    if (['control', 'gap'].includes(card.role) && !byN.has(card.attach)) {
      problems.push(`${where}: "attach" must be the number of the card it applies to`);
    }
  });
  if (!cards.some((card) => card.role === 'sink' || card.role === 'stop')) {
    problems.push(`${file}: every trace ends in at least one sink card, or stop cards when nothing reaches a sink`);
  }
}

function resolveCards(trace) {
  for (const card of trace.cards) {
    if (!card.file) continue;
    const where = `${trace.id} card ${card.n} (${card.file})`;
    card.selection = resolveSelection({ root, where, file: card.file, pattern: card.pattern, problems });
    const value = card.code?.match(/\*\*(.+?)\*\*/)?.[1];
    if (card.selection && value && !selectedText(root, card.file, card.selection).includes(value)) {
      warnings.push(`${where}: the tour highlights "${selectedText(root, card.file, card.selection)}", which doesn't contain the bold value "${value}"`);
    }
  }
}

// A path that branches off another card (via "from") carries that card's origin.
function pathOrigin(trace, pathId, seen = new Set()) {
  const source = trace.cards.find((card) => card.role === 'source' && card.path === pathId);
  if (source) return source.origin;
  const branch = trace.cards.find((card) => card.from !== undefined && [].concat(card.path ?? []).includes(pathId));
  if (!branch || seen.has(pathId)) return 'user';
  seen.add(pathId);
  return cardOrigin(trace, trace.cards.find((card) => card.n === branch.from), seen);
}
// A card on several paths (a shared sink) takes the most sensitive origin.
function cardOrigin(trace, card, seen = new Set()) {
  if (card.role === 'source') return card.origin;
  const origins = [].concat(card.path ?? []).map((p) => pathOrigin(trace, p, seen));
  return Object.keys(ORIGINS).find((origin) => origins.includes(origin)) ?? 'user';
}

function cardLabel(trace, card) {
  const where = card.selection ? `<i>${label(shortPath(card.file))}:${card.selection.start.line}</i>` : null;
  const code = card.code ? `<code>${label(card.code)}</code>` : null;
  const origin = ORIGINS[cardOrigin(trace, card)];
  let head;
  if (card.role === 'source') head = `${origin.dot} <b>SOURCE</b> · ${label(card.label ?? origin.name)}`;
  else if (card.role === 'sink') head = `⚠️ <b>SINK</b>${card.label ? ' · ' + label(card.label) : ''}`;
  else if (card.role === 'stop') head = `✋ <b>${label(card.label ?? 'stops here')}</b>`;
  else if (card.role === 'gap' || card.role === 'control') head = `${ROLE_ICONS[card.role]} ${label(card.label ?? '')}`;
  const parts = card.role === 'hop' ? [where, code] : [head, where, code];
  return `<b>${card.n}</b> · ` + parts.filter(Boolean).join('<br/>');
}

function buildMermaid(trace) {
  const out = ['flowchart TB'];
  const edges = [];
  const lastOnPath = new Map();
  const id = (n) => `C${n}`;

  for (const card of trace.cards) out.push(`    ${id(card.n)}["${cardLabel(trace, card)}"]`);
  out.push('');

  // Paths that share two consecutive cards (after a merge) get one arrow, coloured by
  // the most sensitive origin, instead of parallel arrows.
  const originRank = (origin) => Object.keys(ORIGINS).indexOf(origin);
  const byPair = new Map();
  for (const card of trace.cards) {
    if (card.role === 'source') {
      lastOnPath.set(card.path, card.n);
    } else if (card.role === 'hop' || card.role === 'sink' || card.role === 'stop') {
      for (const p of [].concat(card.path)) {
        const from = card.from ?? lastOnPath.get(p);
        lastOnPath.set(p, card.n);
        if (from === undefined) continue;
        const style = card.role === 'stop' ? 'stop' : 'path';
        const origin = pathOrigin(trace, p);
        const existing = byPair.get(`${from}>${card.n}`);
        if (existing) {
          if (originRank(origin) < originRank(existing.origin)) existing.origin = origin;
          continue;
        }
        const edge = { line: `    ${id(from)} ${style === 'stop' ? '-.->' : '==>'}${card.edge ? `|"${label(card.edge.replace(/^\s*→\s*/, ''))}"|` : ''} ${id(card.n)}`, style, origin };
        byPair.set(`${from}>${card.n}`, edge);
        edges.push(edge);
      }
    } else {
      // Drawn from the card to the side card, so the side card hangs below or beside it.
      edges.push({ line: `    ${id(card.attach)} -.- ${id(card.n)}`, style: card.role });
    }
  }
  for (const edge of edges) out.push(edge.line);
  out.push('');

  const used = new Set(trace.cards.map((card) => cardOrigin(trace, card)));
  for (const origin of used) {
    const { stroke, fill } = ORIGINS[origin];
    out.push(`    classDef source_${origin} fill:${fill},stroke:${stroke},stroke-width:3px,color:#000`);
    out.push(`    classDef hop_${origin} fill:#fff,stroke:${stroke},stroke-width:2px,color:#000`);
    out.push(`    classDef sink_${origin} fill:${fill},stroke:#000,stroke-width:4px,color:#000`);
  }
  out.push('    classDef side fill:#f1f3f4,stroke:#777,stroke-dasharray:4,color:#000');
  out.push('    classDef control fill:#e6f4ea,stroke:#188038,stroke-dasharray:4,color:#000');
  for (const card of trace.cards) {
    const origin = cardOrigin(trace, card);
    const cls = { source: `source_${origin}`, hop: `hop_${origin}`, sink: `sink_${origin}`, stop: 'side', gap: 'side', control: 'control' }[card.role];
    out.push(`    class ${id(card.n)} ${cls}`);
  }

  const groups = new Map();
  edges.forEach((edge, index) => {
    const style =
      edge.style === 'path' ? `stroke:${ORIGINS[edge.origin].stroke},stroke-width:4px`
        : edge.style === 'control' ? 'stroke:#188038,stroke-dasharray:4'
          : 'stroke:#999,stroke-dasharray:4';
    if (!groups.has(style)) groups.set(style, []);
    groups.get(style).push(index);
  });
  for (const [style, indexes] of groups) out.push(`    linkStyle ${indexes.join(',')} ${style}`);
  return out.join('\n');
}

function sourcesTable(trace) {
  const rows = trace.cards.filter((card) => card.role === 'source').map((source) => {
    // Paths that branch off this source's cards (via "from") count as its paths too.
    const paths = new Set([source.path]);
    for (const card of trace.cards) {
      const branchedFrom = trace.cards.find((c) => c.n === card.from);
      if (branchedFrom && [].concat(branchedFrom.path ?? []).some((p) => paths.has(p))) {
        [].concat(card.path ?? []).forEach((p) => paths.add(p));
      }
    }
    const onPath = trace.cards.filter((card) => card.role !== 'source' && [].concat(card.path ?? []).some((p) => paths.has(p)));
    const pathNumbers = new Set([source.n, ...onPath.map((card) => card.n)]);
    const reaches = onPath.some((card) => card.role === 'sink');
    const stop = onPath.find((card) => card.role === 'stop');
    const controls = trace.cards
      .filter((card) => (card.role === 'control' || card.role === 'gap') && pathNumbers.has(card.attach))
      .map((card) => `${ROLE_ICONS[card.role]} ${card.n}: ${plain(card.label)}`);
    const origin = ORIGINS[source.origin];
    return `| ${source.n} · ${plain(source.title)} | ${origin.dot} ${origin.name} | ${plain(source.label ?? '')} | ` +
      `${reaches ? '**Yes**' : `No${stop ? ` (✋ card ${stop.n})` : ''}`} | ${controls.join('<br>') || 'none'} |`;
  });
  return ['| Source | Origin | Details | Reaches the sink? | Controls on the path |', '|---|---|---|---|---|', ...rows].join('\n');
}

function buildMarkdown(trace, mermaid) {
  const cardRows = trace.cards.map((card) => {
    const icon = card.role === 'source' ? ORIGINS[card.origin].dot : ROLE_ICONS[card.role] ?? '';
    const where = card.selection ? `\`${card.file}:${card.selection.start.line}\`` : '(no code)';
    const highlight = card.selection ? `\`${selectedText(root, card.file, card.selection).split('\n')[0]}\`` : '';
    return `| ${card.n} | ${icon} ${plain(card.title)} | ${where} | ${highlight.replace(/\|/g, '\\|')} |`;
  });
  return [
    `# ${trace.title}`,
    '',
    text(trace.description),
    '',
    '**Legend:** one chain per source, top to bottom · top card = source (🔴 user input · 🔵 config · ⚪ constant · 🟢 authenticated identity · 🟣 stored data · 🟠 external service) · ' +
      'each card is a line of code with the value in **bold**, and each arrow says what the value is called next · ⚠️ sink has a thick black frame · ' +
      'dashed side cards: 🚫 a control on the path that does not cover the value, 🛡 one that does, ✋ a path that stops before the sink.',
    '',
    '```mermaid',
    mermaid,
    '```',
    '',
    sourcesTable(trace),
    '',
    '| # | Card | Code | Tour highlights |',
    '|---|---|---|---|',
    ...cardRows,
    '',
    `CodeTour: \`.tours/${tourFileName(trace)}\` (step N = card N).`,
    '',
  ].join('\n');
}

function tourFileName(trace) {
  return `source-to-sink-${trace.order ?? 1}-${trace.id}.tour`;
}

function buildTour(trace, tracesById) {
  const tour = { $schema: 'https://aka.ms/codetour-schema', title: trace.title, description: text(trace.description) };
  if (trace.next) {
    const next = tracesById.get(trace.next);
    if (next) tour.nextTour = next.title;
    else problems.push(`${trace.id}: next trace "${trace.next}" not found`);
  }
  tour.steps = trace.cards.map((card) => {
    const icon = card.role === 'source' ? ORIGINS[card.origin]?.dot : ROLE_ICONS[card.role];
    return tourStep({ ...card, title: `${card.n} · ${icon ? icon + ' ' : ''}${card.title}` });
  });
  return JSON.stringify(tour, null, 2) + '\n';
}

const dir = path.join(root, tracesDir);
const traces = loadSpecs({ root, dir: tracesDir, suffix: '.trace.json', problems, validate });
const tracesById = new Map(traces.map((trace) => [trace.id, trace]));

const outputs = [];
for (const trace of traces) {
  if (!trace.cards) continue;
  resolveCards(trace);
  outputs.push([path.join(dir, `${trace.id}.md`), buildMarkdown(trace, buildMermaid(trace))]);
  outputs.push([path.join(root, '.tours', tourFileName(trace)), buildTour(trace, tracesById)]);
}

if (warnings.length) console.error(warnings.map((warning) => `! ${warning}`).join('\n'));
finish({ root, mode, outputs, problems, script: 'trace.mjs' });
