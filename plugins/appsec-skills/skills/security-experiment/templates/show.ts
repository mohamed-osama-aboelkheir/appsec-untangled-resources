// Step logger for experiment notebooks. Copy to experiments/lib/show.ts.
//
//   setDanger([/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, /<script\b[\s\S]*?<\/script>/gi]);
//   log('marked.parse(input)', html);   // prints the value, dangerous parts in red, then ⚠️ or ✅
//   logList('what DOMPurify removed', ['onerror="…" from <img>: not on its allowlist']);
//
// One console.log per call on purpose: the Deno Jupyter kernel can drop output
// sent in many small pieces.

const RED = '\x1b[1;97;41m';
const RESET = '\x1b[0m';

let danger: RegExp[] = [];

// The parts of a value that make it dangerous at the sink: the payload's active part
// (an event handler, a quote that ends a SQL string, a ../ segment, an internal host).
export function setDanger(patterns: (RegExp | string)[]) {
  danger = patterns.map((p) =>
    typeof p === 'string' ? new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g') : new RegExp(p.source, p.flags.includes('g') ? p.flags : p.flags + 'g'));
}

export function log(step: string, value: unknown, safeMessage = 'nothing dangerous left') {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  const found = danger.flatMap((re) => text.match(re) ?? []);
  const highlighted = danger.reduce((s, re) => s.replace(re, (m) => RED + m + RESET), text.trim());
  console.log([
    `▶ ${step}`,
    '  ' + highlighted.replace(/\n/g, '\n  '),
    found.length ? `  ⚠️  dangerous: ${found.map((m) => m.trim()).join(', ')}` : `  ✅ ${safeMessage}`,
    '',
  ].join('\n'));
}

// Removes the indentation all lines share, e.g. for an HTML fragment cut out of a rendered template.
export function dedent(text: string) {
  const lines = text.split('\n');
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^\s*/)![0].length));
  return lines.map((l) => l.slice(indent)).join('\n');
}

export function logList(title: string, items: string[], empty = 'nothing') {
  console.log([`▶ ${title}`, ...(items.length ? items.map((i) => `  ✂️  ${i}`) : [`  ${empty}`]), ''].join('\n'));
}
