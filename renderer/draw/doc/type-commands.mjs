/** Type menu commands (D5): case, punctuation, special characters, placeholder text and point/area conversion. */
import { PT_TO_MM, normalizeRuns } from './text.mjs';

/** Type > Size, in points. */
export const TYPE_SIZES = Object.freeze([6, 8, 9, 10, 11, 12, 14, 18, 21, 24, 30, 36, 48, 60, 72]);
export const CASE_MODES = Object.freeze({ upper: 'UPPERCASE', lower: 'lowercase', title: 'Title Case', sentence: 'Sentence case' });
/** Insert Special / Whitespace Character: `[id, label, character]` per submenu. */
export const SPECIAL_CHARACTERS = Object.freeze({
  'Symbols': [['bullet', 'Bullet', '•'], ['copyright', 'Copyright Symbol', '©'], ['ellipsis', 'Ellipsis', '…'], ['pilcrow', 'Paragraph Symbol', '¶'],
    ['registered', 'Registered Trademark Symbol', '®'], ['section', 'Section Symbol', '§'], ['trademark', 'Trademark Symbol', '™'], ['degree', 'Degree Symbol', '°']],
  'Hyphens and Dashes': [['em-dash', 'Em Dash', '—'], ['en-dash', 'En Dash', '–'], ['nonbreaking-hyphen', 'Nonbreaking Hyphen', '‑']],
  'Quotation Marks': [['double-left', 'Double Left Quotation Marks', '“'], ['double-right', 'Double Right Quotation Marks', '”'],
    ['single-left', 'Single Left Quotation Mark', '‘'], ['single-right', 'Single Right Quotation Mark', '’']],
});
export const WHITESPACE_CHARACTERS = Object.freeze([['em-space', 'Em Space', ' '], ['en-space', 'En Space', ' '], ['hair-space', 'Hair Space', ' '],
  ['thin-space', 'Thin Space', ' '], ['figure-space', 'Figure Space', ' '], ['punctuation-space', 'Punctuation Space', ' '], ['nonbreaking-space', 'Nonbreaking Space', ' ']]);
/** Command id → character, for every Insert item. */
export const INSERT_CHARACTERS = Object.freeze(Object.fromEntries([...Object.values(SPECIAL_CHARACTERS).flat(), ...WHITESPACE_CHARACTERS].map(([id, , ch]) => [`insert-${id}`, ch])));
export const PLACEHOLDER_TEXT = 'Lorem ipsum dolor sit amet, consectetuer adipiscing elit, sed diam nonummy nibh euismod tincidunt ut laoreet dolore magna aliquam erat volutpat. '
  + 'Ut wisi enim ad minim veniam, quis nostrud exerci tation ullamcorper suscipit lobortis nisl ut aliquip ex ea commodo consequat. '
  + 'Duis autem vel eum iriure dolor in hendrerit in vulputate velit esse molestie consequat, vel illum dolore eu feugiat nulla facilisis at vero eros et accumsan.';

const textOf = runs => runs.map(r => r.text).join('');
/**
 * Runs with `edits` (`{ from, to, text }`, UTF-16 offsets, sorted, not overlapping) applied. Replacement text takes
 * the style of the first character it replaces; untouched characters keep theirs.
 */
export function rewriteRuns(runs, edits) {
  const styles = runs.flatMap(r => Array(r.text.length).fill(r.character ?? null)), text = textOf(runs), out = [];
  const push = (piece, character) => { if (piece) out.push({ text: piece, ...(character ? { character } : {}) }); };
  let at = 0;
  for (const { from, to, text: replacement } of edits) {
    for (let i = at; i < from; i++) push(text[i], styles[i]);
    push(replacement, styles[from] ?? styles[from - 1] ?? null); at = to;
  }
  for (let i = at; i < text.length; i++) push(text[i], styles[i]);
  return normalizeRuns(out.map(r => r.text).join(''), out);
}
const letter = /[\p{L}\p{N}]/u;
/** Runs with the characters from `from` to `to` in another case; a word or sentence starts where the whole text says. */
export function changeCase(runs, mode, from = 0, to = textOf(runs).length) {
  if (!CASE_MODES[mode]) throw new Error('Choose a case.');
  const text = textOf(runs), edits = [];
  let wordStart = true, sentenceStart = true;
  for (let i = 0; i < text.length;) {
    const ch = String.fromCodePoint(text.codePointAt(i)), isLetter = letter.test(ch);
    if (i >= from && i < to) {
      const next = mode === 'upper' || isLetter && (mode === 'title' && wordStart || mode === 'sentence' && sentenceStart) ? ch.toUpperCase() : ch.toLowerCase();
      if (next !== ch) edits.push({ from: i, to: i + ch.length, text: next });
    }
    // An apostrophe inside a word keeps the word going ("don't" → "Don't").
    if (isLetter) { wordStart = false; sentenceStart = false; }
    else if (!(/['’]/u.test(ch) && !wordStart)) wordStart = true;
    if (/[.!?\n]/u.test(ch)) sentenceStart = true;
    i += ch.length;
  }
  return rewriteRuns(runs, edits);
}
/** Smart Punctuation: curly quotes and apostrophes, -- and --- as en and em dashes, ... as an ellipsis. */
export function smartPunctuation(runs, from = 0, to = textOf(runs).length) {
  const text = textOf(runs), edits = [];
  for (let i = from; i < to;) {
    const rest = text.slice(i, to), before = i ? text[i - 1] : '';
    const opening = !before || /[\s([{—–-]/u.test(before);
    const [length, replacement] = rest.startsWith('...') ? [3, '…'] : rest.startsWith('---') ? [3, '—'] : rest.startsWith('--') ? [2, '–']
      : rest[0] === '"' ? [1, opening ? '“' : '”'] : rest[0] === "'" ? [1, opening ? '‘' : '’'] : [1, null];
    if (replacement) edits.push({ from: i, to: i + length, text: replacement });
    i += length;
  }
  return rewriteRuns(runs, edits);
}
/** Placeholder text cut after the last whole word that `visibleEnd` (a UTF-16 offset) still shows. */
export function placeholderFit(text, visibleEnd) {
  if (visibleEnd >= text.length) return text;
  const cut = text.slice(0, visibleEnd).replace(/\s+\S*$/u, '');
  return cut || text.slice(0, Math.max(1, visibleEnd));
}
const pt = n => (n ?? 0) * PT_TO_MM;
/**
 * Convert To Area Type: a frame that fits the point text's lines, and the shift (local mm) that keeps the
 * glyphs where they are; area text puts the first baseline one ascent below its origin.
 */
export function areaTypeValues(values, layout) {
  if (values.kind !== 'point') throw new Error('Select point text to convert to area type.');
  if (values.orientation === 'vertical') throw new Error('Vertical type cannot become area type.');
  const indents = pt(values.leftIndent) + pt(values.rightIndent) + pt(values.firstLineIndent), widest = Math.max(0, ...layout.lineWidths);
  const lead = Math.max(values.leading, ...(values.runs ?? []).map(r => (r.character?.fontSize ?? 0) * 1.2)) * PT_TO_MM;
  const lines = values.text.split('\n').length, gap = pt(values.spaceBefore) + pt(values.spaceAfter), ascent = layout.font.ascent;
  // Every point line starts a paragraph, so the first-line indent narrows them all; a little room avoids a re-wrap.
  const room = widest + .01, frameWidth = Math.max(.1, room + indents);
  const frameHeight = Math.max(.1, (lines - 1) * (lead + gap) + Math.max(lead, ascent - layout.font.descent) + .01);
  const shift = values.alignment === 'center' ? -room / 2 : values.alignment === 'right' ? -room : 0;
  const { orientation, ...rest } = values;
  return { values: { ...rest, kind: 'area', frameWidth, frameHeight }, offset: [shift, -ascent] };
}
/**
 * Convert To Point Type: each wrapped line ends in a line break (the spaces at the wrap become the break),
 * and the shift keeps the lines in place. Lines past the frame's end stay as they are.
 */
export function pointTypeValues(values, layout) {
  if (values.kind !== 'area') throw new Error('Select area type to convert to point type.');
  const text = values.text, starts = new Map();
  for (const g of layout.glyphs) if (g.index !== undefined && !starts.has(g.line)) starts.set(g.line, g.index);
  const edits = [];
  for (const [line, start] of [...starts].sort((a, b) => a[0] - b[0])) {
    if (!line || !start || text[start - 1] === '\n') continue;
    let from = start; while (from > 0 && /[ \t]/u.test(text[from - 1])) from--;
    if (text[from - 1] !== '\n') edits.push({ from, to: start, text: '\n' });
  }
  const runs = rewriteRuns(values.runs ?? [{ text }], edits);
  const room = values.frameWidth - pt(values.leftIndent) - pt(values.rightIndent) - pt(values.firstLineIndent);
  const shift = values.alignment === 'center' ? room / 2 : values.alignment === 'right' ? room : 0;
  const { frameWidth, frameHeight, ...rest } = values;
  return { values: { ...rest, kind: 'point', text: textOf(runs), runs }, offset: [shift, layout.font.ascent] };
}
