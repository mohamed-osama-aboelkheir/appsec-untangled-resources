#!/usr/bin/env node
/**
 * Renders a security review Markdown report (the format of
 * skill/templates/security-review-report.md) into the self-contained HTML
 * report format of skill/templates/security-review-report.html.
 *
 * - Reuses the template's <style> block and its inline code highlighter script,
 *   so every report looks the same and needs nothing installed to view.
 * - Threat (T#), exploitation (E#) and fix (F#) headings become cards with badges.
 * - Numbered code fences become line-numbered code; diff fences get add/del rows.
 *   Each block carries its fence language in data-lang for the highlighter.
 * - Mermaid sequence diagrams become Browser / Network / Backend / Database swim lanes.
 *
 * Usage: node render-report-html.mjs <report.md> <out.html> [template.html]
 * Uses only Node.js built-ins.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [, , inPath, outPath, templateArg] = process.argv;

if (!inPath || !outPath) {
  console.error('Usage: node render-report-html.mjs <report.md> <out.html> [template.html]');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const templatePath = templateArg ?? join(here, '..', 'templates', 'security-review-report.html');
const template = readFileSync(templatePath, 'utf8');
const style = template.match(/<style>[\s\S]*?<\/style>/)[0];
const highlighterScript = template.match(/<script id="code-highlighter">[\s\S]*?<\/script>/)?.[0] ?? '';
const md = readFileSync(inPath, 'utf8').replace(/<!--[\s\S]*?-->\s*/, '');

// ---------------------------------------------------------------------------
// Inline formatting
// ---------------------------------------------------------------------------

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const STATUS = [
  [/✅ (Mitigated|No sink \/ mitigated)/g, 'ok'],
  [/⚠️ Partially mitigated/g, 'warn'],
  [/❌ Not mitigated/g, 'bad'],
  [/❓ Needs verification/g, 'info'],
];

const badgeStatuses = (html) => {
  let out = html;
  for (const [re, cls] of STATUS) {
    out = out.replace(re, (m) => `<span class="badge ${cls}">${m}</span>`);
  }
  return out
    .replace(/🔓 Business logic/g, '<span class="badge logic">🔓 Business logic</span>')
    .replace(/💉 Source to sink/g, '<span class="badge inject">💉 Source to sink</span>');
};

const inline = (text) => {
  const codes = [];
  let s = text.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(`<code>${esc(c)}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = esc(s)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${u}">${t}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[Number(i)]);
};

// A bare status emoji in a table cell becomes a full badge.
const cell = (raw) => {
  const t = raw.trim();
  const single = { '✅': ['ok', '✅ Mitigated'], '⚠️': ['warn', '⚠️ Partial'], '❌': ['bad', '❌ Not mitigated'], '❓': ['info', '❓ Verify'] };
  if (single[t]) return `<span class="badge ${single[t][0]}">${single[t][1]}</span>`;
  return badgeStatuses(inline(t));
};

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

const splitRow = (line) => line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split(/(?<!\\)\|/);

const renderTable = (rows) => {
  const [head, , ...body] = rows.map(splitRow);
  const th = head.map((h) => `<th>${inline(h.trim())}</th>`).join('');
  const trs = body.map((r) => `<tr>${r.map((c) => `<td>${cell(c)}</td>`).join('')}</tr>`).join('\n');
  return `<div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>\n${trs}\n</tbody></table></div>`;
};

const renderCode = (lang, lines) => {
  let file = '';
  // A leading comment names the block: a file path, or a label for languages that
  // have no file (an HTTP exchange, a SQL statement as the database receives it).
  const labelled = ['http', 'sql', 'json', 'yaml'].includes(lang);
  if (lines.length && /^\s*(\/\/|#|--)\s*\S/.test(lines[0]) && (labelled || /[./]/.test(lines[0]))) {
    file = `<span class="file">${esc(lines[0].replace(/^\s*(\/\/|#|--)\s*/, ''))}</span>`;
    lines = lines.slice(1);
  }
  const open = `<pre class="code"${lang ? ` data-lang="${esc(lang)}"` : ''}>${file}`;

  if (lang === 'diff') {
    const body = lines
      .map((line) => {
        const marker = /^[+-]/.test(line) ? line[0] : '';
        const code = /^[+\- ]/.test(line) ? line.slice(1) : line;
        const cls = marker === '+' ? ' add' : marker === '-' ? ' del' : '';
        return `<span class="l${cls}"><span class="mk">${marker}</span>${esc(code) || ' '}</span>`;
      })
      .join('');
    return `${open}${body}</pre>`;
  }

  // Reports right-align line numbers and separate them from the code with two spaces.
  const body = lines
    .map((line) => {
      const m = line.match(/^\s{0,3}(\d{1,4})(?: {1,2}(.*))?$/);
      if (m) return `<span class="l"><span class="n">${m[1]}</span>${esc(m[2] ?? '')}</span>`;
      if (line.trim() === '…') return `<span class="l"><span class="n">…</span></span>`;
      return `<span class="l">${esc(line) || ' '}</span>`;
    })
    .join('');
  return `${open}${body}</pre>`;
};

// Mermaid sequenceDiagram → swim lanes.
// Controls in this flow: "**Step N — label**" + a code fence + an optional 🔗 link.
// These are lifted out of section 1 and rendered inside the matching swim-lane step.
const controls = new Map();
{
  const block = md.match(/### Controls in this flow\n([\s\S]*?)(?=\n### )/);
  if (block) {
    const ls = block[1].split('\n');
    let cur = null;
    for (let i = 0; i < ls.length; i += 1) {
      const line = ls[i];
      let m;
      if ((m = line.match(/^\*\*Step (\d+)\s*[—-]\s*(.+?)\*\*(?:\s*\(`([^`]+)`)?/))) {
        cur = { label: m[2], arrow: m[3] ?? '', code: '', link: '', step: Number(m[1]) };
        controls.set(cur.step, cur);
      } else if (cur && line.startsWith('```')) {
        const lang = line.slice(3).trim();
        const body = [];
        i += 1;
        while (i < ls.length && !ls[i].startsWith('```')) body.push(ls[i++]);
        cur.code = renderCode(lang, body);
      } else if (cur && line.startsWith('🔗')) {
        const lm = line.match(/\[([^\]]+)\]\(([^)]+)\)/);
        if (lm) cur.link = `<a class="code-link" href="${lm[2]}">🔗 ${inline(lm[1])}</a>`;
      }
    }
  }
}

const renderLanes = (lines) => {
  const participants = {};
  const laneOf = (label) => {
    const l = label.toLowerCase();
    if (/database|postgres|mysql|sqlite/.test(l)) return 'db';
    if (/browser|editor|admin ui|integration|space admin|user|caller|attacker/.test(l) && !/backend/.test(l)) return 'browser';
    return 'backend';
  };
  const rows = [];
  for (const raw of lines) {
    const line = raw.trim();
    let m;
    if ((m = line.match(/^(actor|participant)\s+(\w+)\s+as\s+(.+)$/))) {
      const label = m[3].replace(/<br\/?>/g, ' · ');
      participants[m[2]] = { label, lane: m[1] === 'actor' ? 'browser' : laneOf(label) };
      continue;
    }
    if ((m = line.match(/^Note over [^:]+:\s*(.+)$/))) {
      rows.push({ lane: 'note', text: m[1] });
      continue;
    }
    if ((m = line.match(/^(\w+)\s*-?->>\s*(\w+)\s*:\s*(.+)$/))) {
      const from = participants[m[1]] ?? { lane: 'backend', label: m[1] };
      const to = participants[m[2]] ?? { lane: 'backend', label: m[2] };
      let lane;
      if (from.lane === 'browser' && to.lane === 'browser') lane = 'browser';
      else if (from.lane === 'browser' || to.lane === 'browser') lane = 'network';
      else if (to.lane === 'db' || from.lane === 'db') lane = 'db';
      else lane = 'backend';
      const who = lane === 'network' ? `${from.label} → ${to.label}` : to.label;
      rows.push({ lane, text: m[3], who, from: m[1], to: m[2] });
    }
  }
  const lanes = ['browser', 'network', 'backend', 'db'];
  const heads =
    '<div class="lane-head"></div><div class="lane-head browser">🖥️ Browser / client</div>' +
    '<div class="lane-head network">🌐 Network</div><div class="lane-head backend">⚙️ Backend</div>' +
    '<div class="lane-head db">🗄️ Database</div>';
  let n = 0;
  const body = rows
    .map((r) => {
      if (r.lane === 'note') {
        return `<div class="num">ℹ️</div><div class="cell backend" style="grid-column: span 4"><div class="step"><small>${inline(r.text).replace(/&lt;br\/?&gt;/g, '<br />')}</small></div></div>`;
      }
      n += 1;
      const parts = r.text.split(/<br\/?>/);
      const flagged = /\(T\d+\)|❌/.test(r.text);
      const main = inline(parts[0]);
      const extra = parts.slice(1).map((p) => `<small>${inline(p)}</small>`).join('');
      const whoLine = `<small${flagged ? ' class="check"' : ''}>${esc(r.who)}</small>`;
      const control = controls.get(n);
      if (control) {
        control.seen = true;
        // The hint may be written with either arrow style (->> or -->>); compare endpoints only.
        const hint = control.arrow.match(/^(\w+)\s*-?->>\s*(\w+)/);
        if (hint && (hint[1] !== r.from || hint[2] !== r.to)) {
          console.warn(
            `warning: "Step ${n} — ${control.label}" says \`${control.arrow}\` but step ${n} of the diagram is ` +
            `\`${r.from}->>${r.to}\`. Count only the message lines to number a control.`,
          );
        }
      }
      const attached = control ? `<div class="lane-code">${control.code}${control.link}</div>` : '';
      const cells = lanes
        .map((l) => `<div class="cell ${l}">${l === r.lane ? `<div class="step">${main}${extra}${whoLine}</div>${attached}` : ''}</div>`)
        .join('');
      return `<div class="num">${n}</div>${cells}`;
    })
    .join('\n');
  for (const [step, c] of controls) {
    if (!c.seen) console.warn(`warning: "Step ${step} — ${c.label}" has no matching step in the diagram (it has ${n} steps).`);
  }
  return `<div class="table-wrap"><div class="lanes" role="table" aria-label="Request flow">${heads}\n${body}\n</div></div>`;
};

// ---------------------------------------------------------------------------
// Document walk
// ---------------------------------------------------------------------------

const SECTION_IDS = { Summary: 'summary', 1: 'scope', 2: 'entry-points', 3: 'sinks', 4: 'threat-model', 5: 'mitigations', 6: 'action-items' };
const toc = [];
const out = [];
let header = null;
let inSection = false;
let inArticle = false;
let pendingAnchor = null;
let inDetails = false;

const closeArticle = () => {
  if (inArticle) out.push('</article>');
  inArticle = false;
};
const closeSection = () => {
  closeArticle();
  if (inSection) out.push('</section>');
  inSection = false;
};

const lines = md.replace(/### Controls in this flow\n[\s\S]*?(?=\n### )/, '').split('\n');
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  if (/^<a id="[^"]+"><\/a>\s*$/.test(line)) {
    pendingAnchor = line.match(/id="([^"]+)"/)[1];
    continue;
  }

  if (line.startsWith('# ')) {
    const title = line.slice(2);
    const m = title.match(/^(.*?),\s*"(.*)"$/);
    header = { h1: m ? m[1] : title, subtitle: m ? m[2] : '', meta: [] };
    continue;
  }

  // Header meta table directly after the title.
  if (header && !inSection && line.startsWith('| **')) {
    const [k, v] = splitRow(line);
    header.meta.push([k.replace(/\*/g, '').trim(), inline(v.trim())]);
    continue;
  }
  if (header && !inSection && /^\|\s*\|\s*\|$|^\|---\|---\|$/.test(line.trim())) continue;

  if (line.startsWith('> ')) {
    out.push(`<p class="callout warn">${inline(line.slice(2).replace(/^⚠️\s*/, '⚠️ '))}</p>`);
    continue;
  }

  if (line.startsWith('## ')) {
    closeSection();
    const title = line.slice(3);
    const key = title === 'Summary' ? 'Summary' : title.match(/^(\d)\./)?.[1];
    const id = SECTION_IDS[key] ?? title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    toc.push({ id, label: title.replace(/^(\d\.)\s*\S+\s*/, '$1 '), sub: false });
    out.push(`<section id="${id}"><h2>${inline(title)}</h2>`);
    inSection = true;
    continue;
  }

  const card = line.match(/^### ([TEF]\d+) · (.+)$/);
  if (card) {
    closeArticle();
    const [, code, rest] = card;
    const id = pendingAnchor ?? code.toLowerCase();
    pendingAnchor = null;
    const parts = rest.split(' · ');
    const title = parts[0];
    const status = parts.find((p) => /^(✅|⚠️|❌|❓)/.test(p));
    const severity = parts.find((p) => p.startsWith('Severity:'));
    const cls = status?.startsWith('❌') ? 'bad' : status?.startsWith('⚠️') ? 'warn' : status?.startsWith('❓') ? 'warn' : code.startsWith('T') ? 'ok' : 'warn';
    const refs = [...title.matchAll(/\[([TEF]\d+)\]\(#([tef]\d+)\)/g)].map((m) => `<a class="badge info" href="#${m[2]}">${m[1]}</a>`).join('');
    const cleanTitle = title.replace(/\s*\((\[[TEF]\d+\]\(#[tef]\d+\)(,\s*)?)+\)\s*$/, '');
    toc.push({ id, label: `${code} ${cleanTitle.replace(/`/g, '')}`, sub: true });
    out.push(
      `<article class="threat ${cls}" id="${id}"><div class="threat-head"><h3>${code} · ${inline(cleanTitle)}</h3>` +
        (status ? badgeStatuses(esc(status)) : '') +
        refs +
        (severity ? `<span class="badge info">${esc(severity)}</span>` : '') +
        '</div>'
    );
    inArticle = true;
    continue;
  }

  // Sub-headers inside a threat card. Exploitability and the fix get their own
  // colour so a reader scanning the report can find them without reading.
  if (line.startsWith('#### ')) {
    const title = line.slice(5).trim();
    const kind = /exploitab/i.test(title) ? ' sub-exploit' : /fix/i.test(title) ? ' sub-fix' : '';
    out.push(`<h4 class="sub${kind}">${inline(title)}</h4>`);
    continue;
  }

  if (line.startsWith('### ')) {
    closeArticle();
    out.push(`<h3${pendingAnchor ? ` id="${pendingAnchor}"` : ''}>${badgeStatuses(inline(line.slice(4)))}</h3>`);
    pendingAnchor = null;
    continue;
  }

  if (line.startsWith('```')) {
    const lang = line.slice(3).trim();
    const block = [];
    for (i++; i < lines.length && !lines[i].startsWith('```'); i++) block.push(lines[i]);
    if (lang === 'mermaid') out.push(renderLanes(block));
    else out.push(renderCode(lang, block));
    continue;
  }

  if (line.startsWith('|')) {
    const rows = [];
    for (; i < lines.length && lines[i].startsWith('|'); i++) rows.push(lines[i]);
    i--;
    out.push(renderTable(rows));
    continue;
  }

  if (line.trim() === '<details>') {
    const summary = lines[++i].replace(/<\/?summary>|<\/?b>/g, '');
    out.push(`<details><summary>${esc(summary)}</summary><div class="details-body">`);
    inDetails = true;
    continue;
  }
  if (line.trim() === '</details>') {
    out.push('</div></details>');
    inDetails = false;
    continue;
  }

  if (/^\s*[-*] /.test(line) || /^\s*\d+\. /.test(line)) {
    const ordered = /^\s*\d+\. /.test(line);
    const items = [];
    for (; i < lines.length && (/^\s*([-*]|\d+\.) /.test(lines[i]) || /^\s{2,}\S/.test(lines[i])); i++) {
      if (/^\s*([-*]|\d+\.) /.test(lines[i])) items.push(lines[i].replace(/^\s*([-*]|\d+\.) /, ''));
      else items[items.length - 1] += ` ${lines[i].trim()}`;
    }
    i--;
    const tag = ordered ? 'ol' : 'ul';
    out.push(`<${tag}>${items.map((it) => `<li>${badgeStatuses(inline(it))}</li>`).join('')}</${tag}>`);
    continue;
  }

  if (line.trim() === '---') continue;
  if (line.trim() === '') continue;

  if (line.startsWith('<sub>')) {
    closeSection();
    out.push(`<footer>${inline(line.replace(/<\/?sub>/g, ''))}</footer>`);
    continue;
  }

  // Paragraphs, with the report's labelled lines styled like the template.
  let m;
  if (inDetails && (m = line.match(/^\*\*([^*]+):\*\*\s*(.*)$/))) {
    out.push(`<h4>${esc(m[1])}</h4>${m[2] ? `<p>${badgeStatuses(inline(m[2]))}</p>` : ''}`);
  } else if ((m = line.match(/^\*\*Justification:\*\*\s*(.*)$/))) {
    out.push(`<p class="justification"><b>Justification</b><br />${inline(m[1])}</p>`);
  } else if (/^\*\*(Category|Priority):\*\*/.test(line)) {
    const kv = line.split(' · ').map((p) => `<span>${badgeStatuses(inline(p))}</span>`).join('');
    out.push(line.startsWith('**Priority') ? `<div class="kv">${kv}</div>` : `<p class="where">${badgeStatuses(inline(line))}</p>`);
  } else if (line.startsWith('🔗 ')) {
    out.push(`<p class="source-link">${inline(line)}</p>`);
  } else if ((m = line.match(/^\*\*Verdict:\s*(.*)\*\*$/))) {
    out.push(`<p class="verdict">${badgeStatuses(inline(m[1])).replace(/❌ Request changes/, '<span class="badge bad">❌ Request changes</span>')}</p>`);
  } else {
    out.push(`<p>${badgeStatuses(inline(line))}</p>`);
  }
}
closeSection();

// Summary counts from the summary table's status column.
const summaryTable = md.split('## Summary')[1]?.split('\n## ')[0] ?? '';
const count = (re) => (summaryTable.match(re) || []).length;
const counts = {
  total: count(/^\| \[T\d+\]/gm),
  ok: count(/\| ✅ (Mitigated|No sink)/g),
  warn: count(/\| ⚠️ Partially mitigated/g),
  bad: count(/\| ❌ Not mitigated/g),
  info: count(/\| ❓ Needs verification/g),
};
const countsHtml =
  `<div class="counts"><div class="count"><b>${counts.total}</b><span>threats reviewed</span></div>` +
  `<div class="count"><b style="color:var(--ok)">${counts.ok}</b><span>mitigated</span></div>` +
  `<div class="count"><b style="color:var(--warn)">${counts.warn}</b><span>partially mitigated</span></div>` +
  `<div class="count"><b style="color:var(--bad)">${counts.bad}</b><span>not mitigated</span></div>` +
  `<div class="count"><b style="color:var(--info)">${counts.info}</b><span>needs verification</span></div></div>`;

let body = out.join('\n');
body = body.replace(/(<section id="summary"><h2>[^<]*<\/h2>)([\s\S]*?)(<\/section>)/, (_, open, inner, close) => {
  const withCounts = inner.replace(/(<p class="verdict">[\s\S]*?<\/p>)/, `$1`).replace(/(<div class="table-wrap">)/, `${countsHtml}$1`);
  return `${open}<div class="panel">${withCounts}</div>${close}`;
});

const tocHtml = toc
  .map((t) => `<li${t.sub ? ' class="sub"' : ''}><a href="#${t.id}">${esc(t.label.length > 42 ? `${t.label.slice(0, 40)}…` : t.label)}</a></li>`)
  .join('\n');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(header.h1.replace(/^🔐\s*/, ''))}</title>
<!-- Generated from ${inPath.split('/').pop()} by skill/scripts/render-report-html.mjs -->
${style}
<style>
  .lanes .step small.check { color: var(--bad); }
  p.source-link { margin: 0 0 4px; }
  article.threat > ul, article.threat > ol { margin: 6px 0; }
</style>
</head>
<body>
<div class="layout">
<nav class="toc" aria-label="Report sections"><div class="toc-title">Security review</div><ol>
${tocHtml}
</ol></nav>
<main>
<header class="report">
  <h1>${inline(header.h1)}</h1>
  <p class="subtitle">${inline(header.subtitle)}</p>
  <dl class="meta">${header.meta.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>
</header>
${body}
</main>
</div>
${highlighterScript}
</body>
</html>
`;

writeFileSync(outPath, html);
console.log(`Wrote ${outPath} (${html.length} bytes, ${toc.filter((t) => t.sub).length} cards)`);
