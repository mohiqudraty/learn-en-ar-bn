import type { Clip, Language } from '../shared/types';
import { findPhrase, type Cue } from '../shared/text';
import type { VideoCandidate } from './youtube';

const PLAYER_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';

type InnertubeClient = {
  clientName: string;
  clientVersion: string;
  userAgent: string;
  extra?: Record<string, string>;
};

const CLIENTS: InnertubeClient[] = [
  {
    clientName: 'ANDROID',
    clientVersion: '20.10.38',
    userAgent: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)',
  },
  {
    clientName: 'IOS',
    clientVersion: '20.10.4',
    userAgent: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X)',
    extra: { deviceModel: 'iPhone16,2' },
  },
];

type CaptionTrack = {
  baseUrl: string;
  languageCode: string;
  kind?: string;
};

type PlayerResponse = {
  playabilityStatus?: { status?: string };
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: CaptionTrack[];
    };
  };
};

type TimedText = {
  events?: Array<{
    tStartMs?: number;
    segs?: Array<{ utf8?: string }>;
  }>;
};

export type CaptionLookup =
  | { status: 'match'; clip: Clip }
  | { status: 'miss' }
  | { status: 'error' };

export async function lookupCaption(
  video: VideoCandidate,
  lang: Language,
  query: string,
): Promise<CaptionLookup> {
  let sawLanguageMiss = false;

  for (const client of CLIENTS) {
    try {
      const tracks = await fetchTracks(video.videoId, client, lang);
      if (!tracks.length) continue;

      const track = pickTrack(tracks, lang);
      if (!track || track.baseUrl.includes('exp=xpe')) {
        if (!track) sawLanguageMiss = true;
        continue;
      }

      const cues = await fetchCues(track.baseUrl, client.userAgent);
      if (!cues.length) continue;

      const match = findPhrase(cues, query, lang);
      if (!match) return { status: 'miss' };

      return {
        status: 'match',
        clip: {
          videoId: video.videoId,
          title: video.title,
          channelTitle: video.channelTitle,
          startSeconds: match.startSeconds,
          sentence: match.sentence,
        },
      };
    } catch {
      continue;
    }
  }

  return sawLanguageMiss ? { status: 'miss' } : { status: 'error' };
}

function pickTrack(tracks: CaptionTrack[], lang: Language): CaptionTrack | null {
  const matches = tracks.filter((track) => {
    const code = track.languageCode.toLowerCase();
    return code === lang || code.startsWith(`${lang}-`);
  });

  matches.sort((left, right) => rank(right, lang) - rank(left, lang));
  return matches[0] ?? null;
}

function rank(track: CaptionTrack, lang: Language): number {
  const code = track.languageCode.toLowerCase();
  const manual = track.kind === 'asr' ? 0 : 2;
  const exact = code === lang ? 4 : 0;
  return manual + exact;
}

async function fetchTracks(
  videoId: string,
  client: InnertubeClient,
  lang: Language,
): Promise<CaptionTrack[]> {
  const response = await fetch(PLAYER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://www.youtube.com',
      'User-Agent': client.userAgent,
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: client.clientName,
          clientVersion: client.clientVersion,
          hl: lang,
          gl: 'US',
          ...client.extra,
        },
      },
      videoId,
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) throw new Error(`player ${response.status}`);

  const data = (await response.json()) as PlayerResponse;
  if (data.playabilityStatus?.status && data.playabilityStatus.status !== 'OK') {
    throw new Error(data.playabilityStatus.status);
  }

  return data.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
}

async function fetchCues(baseUrl: string, userAgent: string): Promise<Cue[]> {
  const url = new URL(baseUrl.startsWith('http') ? baseUrl : `https:${baseUrl}`);
  url.searchParams.set('fmt', 'json3');

  const response = await fetch(url, {
    headers: { 'User-Agent': userAgent },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`timedtext ${response.status}`);

  const body = await response.text();
  if (!body.trim()) throw new Error('empty timedtext');

  if (body.trim().startsWith('<')) return parseXml(body);

  const data = JSON.parse(body) as TimedText;
  return (data.events ?? []).flatMap((event) => {
    if (event.tStartMs == null || !event.segs) return [];
    const text = event.segs.map((segment) => segment.utf8 ?? '').join('').replace(/\s+/g, ' ').trim();
    return text ? [{ startMs: event.tStartMs, text }] : [];
  });
}

function parseXml(xml: string): Cue[] {
  const cues: Cue[] = [];
  for (const match of xml.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
    const start = /start="([\d.]+)"/.exec(match[1] ?? '');
    if (!start) continue;
    const text = decodeXml(match[2] ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    cues.push({ startMs: Math.round(Number.parseFloat(start[1]) * 1000), text });
  }
  return cues;
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
