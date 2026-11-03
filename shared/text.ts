import type { Language } from './types';

const MARKS = /[\u200c\u200d\u064B-\u065F\u0670\u0640]/g;
const PUNCT = /['’.,!?;:"“”()[\]{}¿¡،؛؟।]/g;
const FLEX_MARK = "['’\\u064B-\\u065F\\u0670\\u0640]*";
const SPOKEN_PREFIX = /^(?:ال|[وبفل])/;

export type Cue = {
  startMs: number;
  text: string;
};

export function normalize(text: string, lang: Language): string {
  const stripped = text.normalize('NFKC').replace(MARKS, '').replace(PUNCT, ' ');
  const folded = lang === 'ar' ? foldArabic(stripped) : stripped;
  return folded.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function findPhrase(
  cues: Cue[],
  query: string,
  lang: Language,
): { startSeconds: number; sentence: string } | null {
  const needle = normalize(query, lang);
  if (!needle) return null;

  const parts: Array<{ startMs: number; normStart: number; normEnd: number; text: string }> = [];
  let normalized = '';

  for (const cue of cues) {
    const piece = normalize(cue.text, lang);
    if (!piece) continue;
    if (normalized) normalized += ' ';
    const normStart = normalized.length;
    normalized += piece;
    parts.push({
      startMs: cue.startMs,
      normStart,
      normEnd: normalized.length,
      text: cue.text.replace(/\s+/g, ' ').trim(),
    });
  }

  const found = locatePhrase(normalized, needle, lang);
  if (!found) return null;

  const startIndex = parts.findIndex((part) => part.normEnd > found.start);
  let endIndex = -1;
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (parts[index].normStart < found.end) {
      endIndex = index;
      break;
    }
  }
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) return null;

  const from = startIndex > 0 && parts[startIndex].startMs - parts[startIndex - 1].startMs < 4000
    ? startIndex - 1
    : startIndex;
  const next = parts[endIndex + 1];
  const to = next && next.startMs - parts[endIndex].startMs < 4000 ? endIndex + 1 : endIndex;
  const sentence = trimSentence(
    parts.slice(from, to + 1).map((part) => part.text).join(' '),
    needle,
    lang,
  );

  return {
    startSeconds: Math.max(0, Math.floor(parts[startIndex].startMs / 1000) - 2),
    sentence,
  };
}

export function splitHighlight(
  sentence: string,
  query: string,
  lang: Language,
): Array<{ text: string; match: boolean }> {
  const pattern = highlightPattern(query, lang);
  if (!pattern) return [{ text: sentence, match: false }];

  const parts: Array<{ text: string; match: boolean }> = [];
  let cursor = 0;

  for (const match of sentence.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push({ text: sentence.slice(cursor, index), match: false });
    if (match[0]) parts.push({ text: match[0], match: true });
    cursor = index + match[0].length;
    if (match[0].length === 0) break;
  }

  if (cursor < sentence.length) parts.push({ text: sentence.slice(cursor), match: false });
  if (!parts.some((part) => part.match)) return [{ text: sentence, match: false }];
  return parts;
}

function foldArabic(text: string): string {
  return text
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');
}

function locatePhrase(haystack: string, needle: string, lang: Language): { start: number; end: number } | null {
  const pattern = phrasePattern(needle, lang, false);
  if (!pattern) return null;
  const match = pattern.exec(haystack);
  if (!match?.[1]) return null;
  const start = match.index + match[0].length - match[1].length;
  return { start, end: start + match[1].length };
}

function phrasePattern(needle: string, lang: Language, highlight: boolean): RegExp | null {
  const words = needle.split(' ').filter(Boolean);
  if (!words.length) return null;

  const tokens = words.map((word, index) => {
    const body = [...word].map((char) => `${charPattern(char, lang, highlight)}${FLEX_MARK}`).join('');
    if (index === 0 && lang === 'ar' && !SPOKEN_PREFIX.test(word)) {
      const article = highlight ? '[اأإآٱ]ل' : 'ال';
      return `(?:[وبفل])?(?:${article})?${body}`;
    }
    return body;
  });

  if (highlight) {
    return new RegExp(`(?<![\\p{L}\\p{N}])(${tokens.join('\\s+')})(?![\\p{L}\\p{N}])`, 'giu');
  }
  return new RegExp(`(?:^|\\s)(${tokens.join('\\s+')})(?=\\s|$)`, 'u');
}

function charPattern(char: string, lang: Language, highlight: boolean): string {
  if (!highlight || lang !== 'ar') return escapeRegExp(char);
  if (char === 'ا') return '[اأإآٱ]';
  if (char === 'ي') return '[يى]';
  if (char === 'ه') return '[هة]';
  return escapeRegExp(char);
}

function trimSentence(sentence: string, needle: string, lang: Language): string {
  const clean = sentence.replace(/\s+/g, ' ').trim();
  if (clean.length <= 280) return clean;

  const found = locatePhrase(normalize(clean, lang), needle, lang);
  const at = found?.start ?? -1;
  const ratio = at === -1 ? 0.5 : at / Math.max(normalize(clean, lang).length, 1);
  const center = Math.min(clean.length - 1, Math.floor(ratio * clean.length));
  const width = found ? found.end - found.start : needle.length;
  const start = Math.max(0, center - 120);
  const end = Math.min(clean.length, center + width + 140);
  const slice = clean.slice(start, end).trim();
  return `${start > 0 ? '…' : ''}${slice}${end < clean.length ? '…' : ''}`;
}

function highlightPattern(query: string, lang: Language): RegExp | null {
  return phrasePattern(normalize(query, lang), lang, true);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
