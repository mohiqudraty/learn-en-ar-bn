import './prefer-ipv4';
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { normalize } from '../shared/text';
import type { Clip, Language, SearchSuccess } from '../shared/types';
import { lookupCaption } from './captions';
import { MATCH_TARGET, RESULT_LIMIT, searchSteps } from './sources';
import { readSearch, writeSearch } from './store';
import { redactSecrets, searchStep, YouTubeRequestError, youtubeApiKey, type VideoCandidate } from './youtube';

const PORT = Number(process.env.PORT) || 3001;
const LANGUAGES = new Set<Language>(['en', 'ar', 'bn']);

const inflight = new Map<string, Promise<SearchSuccess>>();

const app = express();

app.get('/api/search', async (req, res) => {
  const query = one(req.query.q);
  const lang = one(req.query.lang);

  if (!query || query.length > 120 || !isLanguage(lang)) {
    res.status(400).json({
      error: 'bad_request',
      message: 'Enter a word or sentence up to 120 characters.',
    });
    return;
  }

  if (!youtubeApiKey(lang)) {
    res.status(500).json({
      error: 'config',
      message: 'The server is missing a YouTube API key.',
    });
    return;
  }

  try {
    const result = await searchWithCache(query, lang);
    res.json(result);
  } catch (error) {
    const safe = safeError(error);
    if (error instanceof YouTubeRequestError) {
      console.error(`YouTube search failed: ${safe}`);
      res.status(502).json({ error: 'api', message: 'YouTube search failed' });
      return;
    }
    if (error instanceof CaptionUnavailable) {
      console.error(`Captions unavailable: ${safe}`);
      res.status(502).json({
        error: 'captions_unavailable',
        message: 'Public captions could not be read',
      });
      return;
    }
    console.error(`Search failed: ${safe}`);
    res.status(500).json({ error: 'api', message: 'Search failed' });
  }
});

const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) {
      next();
      return;
    }
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`API listening on ${PORT}`);
});

const SPEECH_HINT: Record<Language, string> = {
  en: 'podcast',
  ar: 'بودكاست',
  bn: 'সাক্ষাৎকার',
};

async function searchWithCache(query: string, lang: Language): Promise<SearchSuccess> {
  const normalized = normalize(query, lang);
  const key = `${lang}:${normalized}`;
  const stored = readSearch(lang, normalized);
  if (stored) {
    console.log(`search source=store lang=${lang} clips=${stored.clips.length}`);
    return stored;
  }

  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = runSearch(query, lang)
    .then((result) => {
      writeSearch(lang, normalized, result);
      return result;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

async function runSearch(query: string, lang: Language): Promise<SearchSuccess> {
  const seen = new Set<string>();
  const clips: Clip[] = [];
  let videosSeen = 0;
  let readable = 0;
  let calls = 0;

  const tally = async (apiQuery: string, source: 'api' | 'public'): Promise<boolean> => {
    for (const step of searchSteps(lang)) {
      let videos: VideoCandidate[];
      try {
        videos = await searchStep(apiQuery, lang, step, source);
      } catch (error) {
        if (error instanceof YouTubeRequestError && (error.code === 'quota' || error.code === 'blocked')) return true;
        throw error;
      }
      calls += 1;
      const fresh = videos.filter((video) => {
        if (seen.has(video.videoId)) return false;
        seen.add(video.videoId);
        return true;
      });
      videosSeen += fresh.length;
      if (fresh.length) {
        const lookups = await mapPool(fresh, 5, (video) => lookupCaption(video, lang, query));
        for (const lookup of lookups) {
          if (lookup.status === 'match') clips.push(lookup.clip);
          if (lookup.status !== 'error') readable += 1;
        }
      }
      if (clips.length >= MATCH_TARGET) break;
    }
    return false;
  };

  const speechQuota = await tally(`${query} ${SPEECH_HINT[lang]}`, 'api');
  let plainQuota = false;
  if (clips.length === 0 && !speechQuota) plainQuota = await tally(query, 'api');
  if (clips.length === 0 || ((speechQuota || plainQuota) && clips.length < MATCH_TARGET)) {
    await tally(query, 'public');
  }

  const kept = clips.slice(0, RESULT_LIMIT);
  console.log(`search source=live lang=${lang} calls=${calls} videos=${videosSeen} matches=${kept.length}`);

  if (kept.length) return { clips: kept, notice: null };
  if (videosSeen === 0) return { clips: [], notice: 'no_videos' };
  if (readable === 0) throw new CaptionUnavailable();
  return { clips: [], notice: 'no_caption_match' };
}

async function mapPool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function run(): Promise<void> {
    while (cursor < items.length) {
      const current = cursor;
      cursor += 1;
      results[current] = await worker(items[current]);
    }
  }

  const workers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workers }, () => run()));
  return results;
}

function one(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0].trim();
  return '';
}

function isLanguage(value: string): value is Language {
  return LANGUAGES.has(value as Language);
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Request failed';
  return redactSecrets(message);
}

class CaptionUnavailable extends Error {
  constructor() {
    super('Public captions could not be read');
    this.name = 'CaptionUnavailable';
  }
}
