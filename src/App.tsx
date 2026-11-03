import { useEffect, useState } from 'react';
import type { Clip, Language, SearchErrorBody, SearchErrorCode, SearchNotice, SearchSuccess } from '../shared/types';
import { CaptionLine } from './components/CaptionLine';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { PlayerControls } from './components/PlayerControls';
import { PlayerStage } from './components/PlayerStage';
import { SearchBar } from './components/SearchBar';
import { StatusMessage } from './components/StatusMessage';
import { copy } from './i18n';

type Phase = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export function App() {
  const [uiLang, setUiLang] = useState<Language>('en');
  const [clipLang, setClipLang] = useState<Language>('en');
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [clips, setClips] = useState<Clip[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [notice, setNotice] = useState<SearchNotice | null>(null);
  const [errorCode, setErrorCode] = useState<SearchErrorCode | null>(null);
  const [rate, setRate] = useState(1);
  const [replayToken, setReplayToken] = useState(0);

  const clip = clips[index] ?? null;
  const labels = copy[uiLang];

  useEffect(() => {
    document.documentElement.lang = uiLang;
    document.documentElement.dir = uiLang === 'ar' ? 'rtl' : 'ltr';
    document.title = query ? `MoHi — ${query}` : 'MoHi';
  }, [uiLang, query]);

  useEffect(() => {
    if (!query) return undefined;

    const controller = new AbortController();
    let active = true;
    setPhase('loading');
    setErrorCode(null);

    const params = new URLSearchParams({ q: query, lang: clipLang });
    fetch(`/api/search?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as SearchSuccess | SearchErrorBody;
        if (!response.ok || !('clips' in body)) {
          const failure = body as SearchErrorBody;
          throw failure.error ? failure : { error: 'api' satisfies SearchErrorCode, message: 'Search failed' };
        }
        return body;
      })
      .then((result) => {
        if (!active) return;
        setClips(result.clips);
        setIndex(0);
        setNotice(result.notice);
        setPhase(result.clips.length ? 'ready' : 'empty');
      })
      .catch((error: unknown) => {
        if (!active || isAbort(error)) return;
        setClips([]);
        setNotice(null);
        setErrorCode(isSearchError(error) ? error.error : 'api');
        setPhase('error');
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [query, clipLang]);

  function submit() {
    const next = draft.trim();
    if (!next || next.length > 120) {
      setPhase('error');
      setErrorCode('bad_request');
      return;
    }
    setQuery(next);
  }

  return (
    <div className="app" dir={uiLang === 'ar' ? 'rtl' : 'ltr'}>
      <header className="masthead">
        <div className="brand">
          <span className="logo" aria-hidden="true" />
          <div>
            <h1>MoHi</h1>
            <p className="tagline">{labels.tagline}</p>
          </div>
        </div>
        <div className="language-fields">
          <LanguageSwitcher label={labels.interfaceLabel} lang={uiLang} onChange={setUiLang} />
          <LanguageSwitcher label={labels.clipLabel} lang={clipLang} onChange={setClipLang} />
        </div>
        <SearchBar
          lang={uiLang}
          value={draft}
          loading={phase === 'loading'}
          onChange={setDraft}
          onSubmit={submit}
        />
      </header>

      {phase === 'ready' && clip ? (
        <section className="stage" aria-live="polite">
          <PlayerStage clip={clip} lang={clipLang} rate={rate} replayToken={replayToken} />
          <CaptionLine sentence={clip.sentence} query={query} lang={clipLang} />
          <PlayerControls
            lang={uiLang}
            index={index}
            total={clips.length}
            rate={rate}
            onPrevious={() => setIndex((current) => Math.max(0, current - 1))}
            onNext={() => setIndex((current) => Math.min(clips.length - 1, current + 1))}
            onReplay={() => setReplayToken((current) => current + 1)}
            onRate={setRate}
          />
          <p className="meta">
            {clip.title}
            <span aria-hidden="true"> · </span>
            {clip.channelTitle}
          </p>
        </section>
      ) : (
        <StatusMessage lang={uiLang} phase={phase === 'ready' ? 'idle' : phase} notice={notice} errorCode={errorCode} />
      )}
    </div>
  );
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function isSearchError(error: unknown): error is SearchErrorBody {
  return typeof error === 'object' && error !== null && 'error' in error;
}
