import type { Language } from '../shared/types';
import { RESULT_LIMIT, isBlockedTitle, stepLabel, type OfficialChannel, type SearchStep } from './sources';

export type VideoCandidate = {
  videoId: string;
  title: string;
  channelTitle: string;
};

type SearchItem = {
  id?: { videoId?: string };
  snippet?: { title?: string; channelTitle?: string };
};

type SearchResponse = {
  items?: SearchItem[];
  error?: {
    message?: string;
    status?: string;
    errors?: Array<{ reason?: string }>;
    details?: Array<{ reason?: string }>;
  };
};

type TextNode = {
  simpleText?: string;
  runs?: Array<{ text?: string }>;
};

type VideoNode = {
  videoId?: string;
  title?: TextNode;
  shortBylineText?: TextNode;
  longBylineText?: TextNode;
  ownerText?: TextNode;
};

export class YouTubeRequestError extends Error {
  code: 'quota' | 'api' | 'blocked';

  constructor(code: 'quota' | 'api' | 'blocked', message: string) {
    super(message);
    this.name = 'YouTubeRequestError';
    this.code = code;
  }
}

const SEARCH_URL = 'https://www.youtube.com/youtubei/v1/search?prettyPrint=false';
const ANDROID_UA = 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)';
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const skippedLangs = new Set<Language>();

const KEY_NAMES: Record<Language, string> = {
  en: 'API_KEY_EN',
  ar: 'API_KEY_AR',
  bn: 'API_KEY_BN',
};

export function youtubeApiKey(lang?: Language): string | undefined {
  if (lang) {
    const named = process.env[KEY_NAMES[lang]];
    if (named) return named;
  }
  return process.env.API_KEY || process.env.YOUTUBE_API_KEY;
}

export function youtubeKeyName(lang: Language): string {
  if (process.env[KEY_NAMES[lang]]) return KEY_NAMES[lang];
  if (process.env.API_KEY) return 'API_KEY';
  if (process.env.YOUTUBE_API_KEY) return 'YOUTUBE_API_KEY';
  return 'missing';
}

export function redactSecrets(message: string): string {
  for (const value of [
    process.env.API_KEY,
    process.env.YOUTUBE_API_KEY,
    process.env.API_KEY_EN,
    process.env.API_KEY_AR,
    process.env.API_KEY_BN,
  ]) {
    if (value) message = message.replaceAll(value, '[key]');
  }
  return message;
}

export async function searchStep(
  query: string,
  lang: Language,
  step: SearchStep,
  source: 'api' | 'public',
): Promise<VideoCandidate[]> {
  const label = stepLabel(step);
  if (source === 'api') {
    if (skippedLangs.has(lang)) {
      throw new YouTubeRequestError('quota', 'YouTube search is unavailable for this language');
    }
    try {
      const videos = filterCandidates(lang, await searchApiOnce(query, lang, step));
      console.log(`YouTube search source=api lang=${lang} key=${youtubeKeyName(lang)} step=${label} videos=${videos.length}`);
      return videos;
    } catch (error) {
      if (!(error instanceof YouTubeRequestError) || (error.code !== 'blocked' && error.code !== 'quota')) throw error;
      skippedLangs.add(lang);
      console.warn(
        `YouTube Data API search is unavailable for ${lang} (${error.code}). Later searches for that language use public YouTube search.`,
      );
      throw error;
    }
  }

  const found = step.kind === 'channel'
    ? await searchChannelPage(query, step.channel)
    : await searchPublicRegion(query, lang, step.regionCode);
  const videos = filterCandidates(lang, found);
  console.log(`YouTube search source=public lang=${lang} step=${label} videos=${videos.length}`);
  return videos;
}

async function searchApiOnce(query: string, lang: Language, step: SearchStep): Promise<VideoCandidate[]> {
  const apiKey = youtubeApiKey(lang);
  if (!apiKey) throw new YouTubeRequestError('api', 'Missing API key');

  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('videoCaption', 'closedCaption');
  url.searchParams.set('videoEmbeddable', 'true');
  url.searchParams.set('safeSearch', 'strict');
  url.searchParams.set('maxResults', '15');
  url.searchParams.set('relevanceLanguage', lang);
  url.searchParams.set('regionCode', step.kind === 'region' ? step.regionCode : 'BD');
  url.searchParams.set('q', query);
  url.searchParams.set('key', apiKey);
  if (step.kind === 'channel') url.searchParams.set('channelId', step.channel.id);

  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const body = (await response.json()) as SearchResponse;
  if (!response.ok) throw youtubeFailure(response.status, body);

  return (body.items ?? [])
    .map((item) => ({
      videoId: item.id?.videoId ?? '',
      title: decodeHtml(item.snippet?.title ?? ''),
      channelTitle: decodeHtml(item.snippet?.channelTitle ?? '') || (step.kind === 'channel' ? step.channel.name : ''),
    }))
    .filter((item) => item.videoId);
}

function youtubeFailure(status: number, body: SearchResponse): YouTubeRequestError {
  const reason = body.error?.errors?.[0]?.reason ?? '';
  const blocked = body.error?.details?.some((detail) => detail.reason === 'API_KEY_SERVICE_BLOCKED')
    || (status === 403 && reason === 'forbidden');
  if (reason === 'quotaExceeded' || reason === 'rateLimitExceeded' || status === 429) {
    return new YouTubeRequestError('quota', 'Quota exceeded');
  }
  if (blocked) return new YouTubeRequestError('blocked', 'YouTube search is blocked for this key');
  return new YouTubeRequestError('api', body.error?.message ?? 'YouTube search failed');
}

async function searchPublicRegion(query: string, lang: Language, region: string): Promise<VideoCandidate[]> {
  const response = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://www.youtube.com',
      'User-Agent': ANDROID_UA,
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: 'ANDROID',
          clientVersion: '20.10.38',
          hl: lang,
          gl: region,
        },
      },
      query,
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) return [];

  const videos: VideoCandidate[] = [];
  collectVideos(await response.json(), videos, new Set(), 12);
  return videos;
}

async function searchChannelPage(query: string, channel: OfficialChannel): Promise<VideoCandidate[]> {
  const url = `https://www.youtube.com/channel/${channel.id}/search?query=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': BROWSER_UA,
      'Accept-Language': 'bn,en;q=0.8',
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) return [];

  const data = extractJson(await response.text(), 'ytInitialData');
  if (!data) return [];

  const videos: VideoCandidate[] = [];
  collectVideos(data, videos, new Set(), 6);
  return videos.map((video) => ({
    ...video,
    channelTitle: video.channelTitle || channel.name,
  }));
}

function filterCandidates(lang: Language, videos: VideoCandidate[]): VideoCandidate[] {
  const seen = new Set<string>();
  const kept: VideoCandidate[] = [];
  for (const video of videos) {
    if (!video.videoId || seen.has(video.videoId) || isBlockedTitle(lang, video.title, video.channelTitle)) continue;
    seen.add(video.videoId);
    kept.push(video);
    if (kept.length >= RESULT_LIMIT) break;
  }
  return kept;
}

function extractJson(html: string, marker: string): unknown {
  const start = html.indexOf(marker);
  if (start < 0) return null;
  const brace = html.indexOf('{', start);
  if (brace < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = brace; index < html.length; index += 1) {
    const char = html[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(brace, index + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function collectVideos(node: unknown, videos: VideoCandidate[], seen: Set<string>, limit: number): void {
  if (!node || typeof node !== 'object' || videos.length >= limit) return;

  if (Array.isArray(node)) {
    for (const item of node) collectVideos(item, videos, seen, limit);
    return;
  }

  const video = node as VideoNode;
  const title = readText(video.title);
  if (video.videoId && /^[\w-]{11}$/.test(video.videoId) && title && !seen.has(video.videoId)) {
    seen.add(video.videoId);
    videos.push({
      videoId: video.videoId,
      title: decodeHtml(title),
      channelTitle: decodeHtml(readText(video.shortBylineText) || readText(video.longBylineText) || readText(video.ownerText)),
    });
  }

  for (const value of Object.values(node)) collectVideos(value, videos, seen, limit);
}

function readText(node: TextNode | undefined): string {
  if (!node) return '';
  if (typeof node.simpleText === 'string') return node.simpleText;
  if (Array.isArray(node.runs)) return node.runs.map((run) => run.text ?? '').join('');
  return '';
}

function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    quot: '"',
    apos: "'",
    lt: '<',
    gt: '>',
    nbsp: ' ',
  };

  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (entity, body: string) => {
    if (body.startsWith('#x')) return fromCode(Number.parseInt(body.slice(2), 16), entity);
    if (body.startsWith('#')) return fromCode(Number.parseInt(body.slice(1), 10), entity);
    return named[body] ?? entity;
  });
}

function fromCode(code: number, fallback: string): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return fallback;
  return String.fromCodePoint(code);
}
