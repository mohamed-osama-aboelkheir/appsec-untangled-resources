#!/usr/bin/env node
// Builds CodeTour tours and Mermaid sequence diagrams from flow specs.
//
//   node walkthrough.mjs build [flowsDir]   write .tours/*.tour and <flowsDir>/*.md
//   node walkthrough.mjs check [flowsDir]   exit 1 if outputs are stale or a spec is invalid
//
// Run from the repository root. flowsDir defaults to docs/flows. Each
// <flowsDir>/<id>.flow.json produces .tours/<order>-<id>.tour and <flowsDir>/<id>.md.
// The spec format is documented in ../references/flow-spec.md.

import path from 'node:path';
import { finish, loadSpecs, resolveSelection, text, tourStep } from '../../../lib/tours.mjs';

const [mode = 'build', flowsDir = 'docs/flows'] = process.argv.slice(2);
if (!['build', 'check'].includes(mode)) {
  console.error('usage: walkthrough.mjs build|check [flowsDir]');
  process.exit(2);
}

const root = process.cwd();
const problems = [];

const PHASE_COLORS = {
  routing: 'rgba(66,133,244,0.10)',
  authentication: 'rgba(52,168,83,0.10)',
  authorization: 'rgba(52,168,83,0.10)',
  'input handling': 'rgba(251,188,4,0.12)',
  'business logic': 'rgba(155,89,182,0.10)',
  'data access': 'rgba(234,67,53,0.12)',
  'external call': 'rgba(234,67,53,0.12)',
  rendering: 'rgba(26,188,156,0.10)',
  response: 'rgba(128,128,128,0.10)',
};
const FALLBACK_COLOR = 'rgba(128,128,128,0.06)';
const FILE_BOX_COLOR = 'rgba(255,255,255,0.75)';
const ICONS = { control: '🔒 ', sink: '⚠️ ', source: '🎯 ' };

// Mermaid treats ";" as a statement end and "#" as an entity start.
const mm = (value) => String(value).replace(/#/g, '#35;').replace(/;/g, '#59;').replace(/\n/g, '<br/>');
const shortPath = (file) => file.replace(/^src\//, '');

function resolveStep(flowId, step) {
  if (!step.file) return;
  const where = `${flowId} step ${step.n} (${step.file})`;
  const selection = resolveSelection({ root, where, file: step.file, pattern: step.pattern, problems });
  if (selection) step.selection = selection;
}

function stepLabel(step) {
  return `${step.n} · ${ICONS[step.kind] ?? ''}${step.title}`;
}

function buildMermaid(flow) {
  const steps = new Map(flow.steps.map((step) => [step.n, step]));
  const lanes = new Map(flow.lanes.map((lane) => [lane.id, lane]));
  const actor = flow.actor;
  const used = new Set();
  const out = ['sequenceDiagram'];

  const filesByLane = new Map();
  for (const step of flow.steps) {
    if (!step.lane) continue;
    if (!lanes.has(step.lane)) problems.push(`${flow.id} step ${step.n}: unknown lane "${step.lane}"`);
    if (!step.file) continue;
    if (!filesByLane.has(step.lane)) filesByLane.set(step.lane, new Set());
    filesByLane.get(step.lane).add(step.file);
  }
  const isMultiFile = (laneId) => (filesByLane.get(laneId)?.size ?? 0) > 1;

  out.push(`    actor ${actor.id} as ${mm(actor.name)}`);
  for (const lane of flow.lanes) {
    const files = [...(filesByLane.get(lane.id) ?? [])];
    const label = files.length === 1 ? `${lane.name}\n${path.basename(files[0])}` : lane.name;
    out.push(`    participant ${lane.id} as ${mm(lane.label ?? label)}`);
  }
  out.push('');

  const participant = (id, context) => {
    if (id !== actor.id && !lanes.has(id)) problems.push(`${flow.id}: unknown participant "${id}" in ${context}`);
    return id;
  };
  const getStep = (n, context) => {
    const step = steps.get(n);
    if (!step) problems.push(`${flow.id}: unknown step ${n} in ${context}`);
    else used.add(n);
    return step;
  };
  const stepNumbers = (events) =>
    events.flatMap((event) => [
      ...(event.step !== undefined ? [event.step] : []),
      ...stepNumbers(event.events ?? []),
      ...(event.alt ?? []).flatMap((branch) => stepNumbers(branch.events ?? [])),
    ]);
  const first = actor.id;
  const last = flow.lanes[flow.lanes.length - 1].id;

  function render(events, indent) {
    const pad = ' '.repeat(indent);
    for (const event of events) {
      if (event.phase) {
        const numbers = stepNumbers(event.events ?? []);
        const range = numbers.length
          ? ` · ${Math.min(...numbers) === Math.max(...numbers) ? 'step ' + Math.min(...numbers) : `steps ${Math.min(...numbers)}–${Math.max(...numbers)}`}`
          : '';
        out.push(`${pad}rect ${event.color ?? PHASE_COLORS[event.phase.toLowerCase()] ?? FALLBACK_COLOR}`);
        out.push(`${pad}    Note over ${first},${last}: ${mm(event.phase + range)}`);
        render(event.events ?? [], indent + 4);
        out.push(`${pad}end`);
        out.push('');
      } else if (event.call || event.return) {
        const [from, to] = event.call ?? event.return;
        const arrow = event.call ? '->>' : '-->>';
        const step = event.step !== undefined ? getStep(event.step, 'an arrow') : null;
        const label = [step ? stepLabel(step) : null, event.text].filter(Boolean).join('\n');
        out.push(`${pad}${participant(from, 'an arrow')}${arrow}${participant(to, 'an arrow')}: ${mm(label)}`);
      } else if (event.step !== undefined) {
        const step = getStep(event.step, 'a step note');
        if (!step) continue;
        const lane = event.over ?? step.lane;
        const body = mm([stepLabel(step), ...(step.note ?? [])].join('\n'));
        if (step.file && isMultiFile(lane)) {
          out.push(`${pad}rect ${FILE_BOX_COLOR}`);
          out.push(`${pad}    Note over ${lane}: ${mm('📄 ' + shortPath(step.file))}`);
          out.push(`${pad}    Note over ${lane}: ${body}`);
          out.push(`${pad}end`);
        } else {
          out.push(`${pad}Note over ${participant(lane, `step ${step.n}`)}: ${body}`);
        }
      } else if (event.note) {
        const over = [].concat(event.over).map((id) => participant(id, 'a note')).join(',');
        out.push(`${pad}Note over ${over}: ${mm(event.note)}`);
      } else if (event.break) {
        out.push(`${pad}break ${mm(event.break)}`);
        render(event.events ?? [], indent + 4);
        out.push(`${pad}end`);
      } else if (event.alt) {
        event.alt.forEach((branch, index) => {
          out.push(`${pad}${index === 0 ? 'alt' : 'else'} ${mm(branch.label)}`);
          render(branch.events ?? [], indent + 4);
        });
        out.push(`${pad}end`);
      } else {
        problems.push(`${flow.id}: unrecognised diagram event ${JSON.stringify(event)}`);
      }
    }
  }

  render(flow.diagram, 4);
  for (const step of flow.steps) {
    if (!used.has(step.n)) problems.push(`${flow.id} step ${step.n}: not shown in the diagram`);
  }
  while (out[out.length - 1] === '') out.pop();
  return out.join('\n');
}

function buildMarkdown(flow, mermaid) {
  const rows = flow.steps.map((step) => {
    const code = step.selection ? `\`${step.file}:${step.selection.start.line}\`` : '(no code)';
    return `| ${step.n} | ${ICONS[step.kind] ?? ''}${step.title} | ${code} |`;
  });
  return [
    `# ${flow.title}`,
    '',
    text(flow.description),
    '',
    '**Legend:** coloured bands are phases · 🔒 security control · ⚠️ sink / scanner finding · 🎯 untrusted source · ' +
      'solid arrows are calls, dashed are returns and responses · `break` boxes stop the request · ' +
      'in lanes with several files, each file\'s steps sit in a white box headed 📄 *file*, stacked in call order.',
    '',
    '```mermaid',
    mermaid,
    '```',
    '',
    '| # | Step | Code |',
    '|---|---|---|',
    ...rows,
    '',
    `CodeTour: \`.tours/${tourFileName(flow)}\` (step N matches diagram step N).`,
    '',
  ].join('\n');
}

function tourFileName(flow) {
  return `${flow.order ?? 1}-${flow.id}.tour`;
}

function buildTour(flow, flowsById, isPrimary) {
  const tour = {
    $schema: 'https://aka.ms/codetour-schema',
    title: flow.title,
    description: text(flow.description),
  };
  if (isPrimary) tour.isPrimary = true;
  if (flow.next) {
    const next = flowsById.get(flow.next);
    if (next) tour.nextTour = next.title;
    else problems.push(`${flow.id}: next flow "${flow.next}" not found`);
  }
  tour.steps = flow.steps.map((step) => tourStep({ ...step, title: stepLabel(step) }));
  return JSON.stringify(tour, null, 2) + '\n';
}

function validate(flow, file) {
  for (const key of ['id', 'title', 'actor', 'lanes', 'steps', 'diagram']) {
    if (!flow[key]) problems.push(`${file}: missing "${key}"`);
  }
  (flow.steps ?? []).forEach((step, index) => {
    if (step.n !== index + 1) problems.push(`${file}: steps must be numbered 1..N in order (found ${step.n} at position ${index + 1})`);
    if (!step.title) problems.push(`${file} step ${step.n}: missing title`);
    if (!step.description) problems.push(`${file} step ${step.n}: missing description`);
  });
}

const dir = path.join(root, flowsDir);
const flows = loadSpecs({ root, dir: flowsDir, suffix: '.flow.json', problems, validate });
const flowsById = new Map(flows.map((flow) => [flow.id, flow]));

const outputs = [];
flows.forEach((flow, index) => {
  if (problems.length && !flow.steps) return;
  for (const step of flow.steps) resolveStep(flow.id, step);
  const mermaid = buildMermaid(flow);
  outputs.push([path.join(dir, `${flow.id}.md`), buildMarkdown(flow, mermaid)]);
  outputs.push([path.join(root, '.tours', tourFileName(flow)), buildTour(flow, flowsById, index === 0)]);
});

finish({ root, mode, outputs, problems, script: 'walkthrough.mjs' });
