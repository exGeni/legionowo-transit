// Independent second parser for Legionowo bus-stop timetable pages (cross-check).
// No dependencies. Anything unexpected inside a timetable table throws.

const ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  ensp: ' ', emsp: ' ', thinsp: ' ', shy: '­',
  ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', bdquo: '„',
  oacute: 'ó', Oacute: 'Ó', aogon: 'ą', Aogon: 'Ą', cacute: 'ć', Cacute: 'Ć',
  eogon: 'ę', Eogon: 'Ę', lstrok: 'ł', Lstrok: 'Ł', nacute: 'ń', Nacute: 'Ń',
  sacute: 'ś', Sacute: 'Ś', zacute: 'ź', Zacute: 'Ź', zdot: 'ż', Zdot: 'Ż',
};

const MONTHS = [
  'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
  'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia',
];
const MONTH = `(?:${MONTHS.join('|')})`;

// A complete or partial "Obowiązuje od <date>" note, and nothing else.
const VALIDITY_NOTE = new RegExp(
  `^(?:Obowiązuje\\s*:?)?\\s*(?:od\\s*:?)?\\s*(?:dnia)?\\s*(?:\\d{1,2})?\\s*${MONTH}?\\s*(?:\\d{4})?\\s*(?:roku|r\\.?)?$`,
  'i',
);
const VALID_FROM = new RegExp(
  `Obowiązuje[^0-9]{0,40}?od\\s*:?\\s*(?:dnia\\s*)?(\\d{1,2})\\s*(${MONTHS.join('|')})\\s*(\\d{4})`,
  'i',
);

const TAG = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
const BLOCK_TAGS = /^(?:address|article|br|caption|div|h[1-6]|hr|li|ol|p|section|table|tbody|td|tfoot|th|thead|tr|ul)$/i;

function decodeEntities(s) {
  return s.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, name) => {
    if (name[0] !== '#') return Object.hasOwn(ENTITIES, name) ? ENTITIES[name] : whole;
    const hex = name[1] === 'x' || name[1] === 'X';
    const code = parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10);
    return code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

const collapse = (s) => s.replace(/\s+/g, ' ').trim();

// Block-level tags become line breaks; inline tags vanish, so words split by spans stay whole.
function toLines(html) {
  const marked = html
    .replace(/\s+/g, ' ')
    .replace(TAG, (_, _slash, name) => (BLOCK_TAGS.test(name) ? '\n' : ''));
  return decodeEntities(marked)
    .replace(/[­​-‍﻿]/g, '')
    .normalize('NFC')
    .split('\n')
    .map(collapse)
    .filter(Boolean);
}

const toText = (html) => toLines(html).join(' ');

function hasClass(attributes, className) {
  const cls = /(?:^|\s)class\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(attributes);
  return (cls?.[1] ?? cls?.[2] ?? cls?.[3] ?? '').split(/\s+/).includes(className);
}

// Inner HTML of every <div> carrying the given class, matched by nesting depth.
function divsByClass(html, className) {
  const found = [];
  const open = [];
  for (const m of html.matchAll(TAG)) {
    if (m[2].toLowerCase() !== 'div') continue;
    if (!m[1]) {
      open.push({ wanted: hasClass(m[3], className), start: m.index + m[0].length });
    } else {
      const div = open.pop();
      if (div?.wanted) found.push(html.slice(div.start, m.index));
    }
  }
  if (open.some((d) => d.wanted)) throw new Error(`Unclosed <div class="${className}">`);
  return found;
}

// The div.rozklad1 wrapper or, on pages without one, everything between the
// "Przystanek:" heading and the stop list (div.rozklad2), which has its own "kierunek:".
function timetableBlock(html) {
  const wrapped = divsByClass(html, 'rozklad1');
  if (wrapped.length) {
    // Some pages nest the wrapper in itself: the innermost one holds the timetable.
    const inner = wrapped.reduce((a, b) => (b.length < a.length ? b : a));
    if (!wrapped.every((w) => w.includes(inner))) {
      throw new Error(`Expected one timetable block, found ${wrapped.length}`);
    }
    return inner;
  }

  const headings = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/gi)]
    .filter((m) => /^Przystanek\s*:/i.test(toText(m[1])));
  if (headings.length !== 1) throw new Error('No timetable block');
  const start = headings[0].index + headings[0][0].length;
  const stopList = [...html.matchAll(TAG)].find(
    (m) => m.index >= start && !m[1] && m[2].toLowerCase() === 'div' && hasClass(m[3], 'rozklad2'),
  );
  if (!stopList) throw new Error('No timetable block');
  return html.slice(start, stopList.index);
}

// Every table in document order, each holding only its own rows (nested tables are separate).
function readTables(html) {
  const tables = [];
  const stack = [];
  let last = 0;

  const append = (chunk) => {
    const t = stack.at(-1);
    if (!t) return;
    if (t.cell !== null) t.row[t.cell] += chunk;
    else t.stray += chunk;
  };

  for (const m of html.matchAll(TAG)) {
    append(html.slice(last, m.index));
    last = m.index + m[0].length;
    const closing = m[1] === '/';
    const name = m[2].toLowerCase();
    const t = stack.at(-1);

    if (name === 'table') {
      if (!closing) {
        const table = { rows: [], row: null, cell: null, stray: '' };
        tables.push(table);
        stack.push(table);
      } else {
        if (!t) throw new Error('Stray </table> in timetable block');
        stack.pop();
      }
    } else if (t && name === 'tr') {
      t.cell = null;
      t.row = closing ? null : [];
      if (!closing) t.rows.push(t.row);
    } else if (t && (name === 'td' || name === 'th')) {
      if (closing) {
        t.cell = null;
      } else {
        if (!t.row) t.rows.push((t.row = []));
        t.cell = t.row.push('') - 1;
      }
    } else if (t && (name === 'tbody' || name === 'thead' || name === 'tfoot')) {
      t.row = null;
      t.cell = null;
    } else {
      append(m[0]);
    }
  }
  if (stack.length) throw new Error('Unclosed <table> in timetable block');
  return tables;
}

function parseHour(text) {
  if (!/^\d{1,2}$/.test(text) || Number(text) > 23) {
    throw new Error(`Unexpected hour cell: "${text}"`);
  }
  return text.padStart(2, '0');
}

function parseMinutes(cellHtml) {
  // Superscripts and images are footnote markers; flattening them would lose or distort data.
  if (/<img\b/i.test(cellHtml)) throw new Error('Image inside a minutes cell');
  for (const m of cellHtml.matchAll(/<(sup|sub)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)) {
    if (toText(m[2])) throw new Error(`Footnote marker in minutes cell: "${toText(cellHtml)}"`);
  }
  const text = toText(cellHtml);
  if (!/^[\d\s,;.|/]*$/.test(text)) throw new Error(`Unexpected minutes cell: "${text}"`);
  return (text.match(/\d+/g) ?? []).map((v) => {
    if (v.length > 2 || Number(v) > 59) throw new Error(`Invalid minute "${v}" in cell "${text}"`);
    return v.padStart(2, '0');
  });
}

function assertValidityNote(texts) {
  const note = texts.join(' ');
  if (note && !VALIDITY_NOTE.test(note)) {
    throw new Error(`Unrecognised text in timetable table: "${note}"`);
  }
}

function parseTable(table) {
  assertValidityNote(toLines(table.stray));

  const rows = table.rows
    .map((cells) => ({ cells, texts: cells.map(toText) }))
    .filter((r) => r.texts.some(Boolean) || r.cells.some((c) => /<img\b/i.test(c)));

  const isHeader = (r) => {
    const t = r.texts.filter(Boolean);
    return t.length === 2 && /^godz\.?$/i.test(t[0]) && /^min\.?$/i.test(t[1]);
  };
  const headers = rows.flatMap((r, i) => (isHeader(r) ? [i] : []));
  const rowText = (r) => r.texts.filter(Boolean).join(' ');

  if (!headers.length) {
    assertValidityNote(rows.map(rowText));
    return [];
  }

  // The label is the row directly above each header.
  for (const h of headers) {
    if (h === 0 || isHeader(rows[h - 1]) || /^[\d\s]+$|^Obowiązuje/i.test(rowText(rows[h - 1]))) {
      throw new Error('Timetable header row without a day label');
    }
  }
  assertValidityNote(rows.slice(0, headers[0] - 1).map(rowText));

  return headers.map((h, n) => {
    const end = n + 1 < headers.length ? headers[n + 1] - 1 : rows.length;
    const times = [];
    let i = h + 1;
    for (; i < end && /^\d/.test(rows[i].texts[0] ?? ''); i++) {
      const [hourText, ...minuteTexts] = rows[i].texts;
      if (!minuteTexts.length) throw new Error(`Hour row without a minutes cell: "${hourText}"`);
      const hour = parseHour(hourText);
      for (const cell of rows[i].cells.slice(1)) {
        for (const minute of parseMinutes(cell)) times.push(`${hour}:${minute}`);
      }
    }
    // Whatever follows the hour rows may only be the validity note.
    assertValidityNote(rows.slice(i, end).map(rowText));
    return { label: rowText(rows[h - 1]), times: times.sort() };
  });
}

function parseValidFrom(text) {
  const m = VALID_FROM.exec(text);
  if (!m) return null;
  const day = Number(m[1]);
  const month = MONTHS.indexOf(m[2].toLowerCase()) + 1;
  const year = Number(m[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCDate() !== day || date.getUTCMonth() !== month - 1) {
    throw new Error(`Impossible validity date: "${m[0]}"`);
  }
  return date.toISOString().slice(0, 10);
}

export function parseStopPage(html) {
  const clean = String(html).replace(/<!--[\s\S]*?-->|<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '');

  const block = timetableBlock(clean);
  const lines = toLines(block);
  const text = lines.join(' ');

  const headsign = lines
    .map((l) => /kierunek\s*:\s*(.*?)(?:\s*Linia\s+[A-Z]*\d.*)?$/i.exec(l)?.[1])
    .find((h) => h !== undefined);
  if (!headsign) throw new Error('No "kierunek:" headsign in timetable block');

  const line = /\bLinia\s*:?\s*([A-Z]+\d+[A-Z]*)\b/i.exec(text)?.[1].toUpperCase();
  if (!line) throw new Error('No line number in timetable block');

  const crumbs = divsByClass(clean, 'breadcrumb-1').map(toText).join(' ');
  const stopName = /.*Przystanek\s*:\s*([^|]+)/i.exec(crumbs)?.[1].trim();
  if (!stopName) throw new Error('No "Przystanek:" entry in breadcrumb');

  const days = readTables(block).flatMap(parseTable);
  if (!days.length) throw new Error('No day tables in timetable block');

  return { line, headsign, stopName, validFrom: parseValidFrom(text), days };
}
