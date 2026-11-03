import { useEffect, useRef } from 'react';
import type { Clip, Language } from '../../shared/types';

type YouTubePlayer = {
  destroy(): void;
  loadVideoById(options: { videoId: string; startSeconds?: number }): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  setPlaybackRate(rate: number): void;
};

type YouTubeEvent = {
  target: YouTubePlayer;
  data: number;
};

type YouTubeApi = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId?: string;
      host?: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: YouTubeEvent) => void;
        onStateChange?: (event: YouTubeEvent) => void;
      };
    },
  ) => YouTubePlayer;
  PlayerState: { PLAYING: number };
};

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve();
      };
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(script);
      }
    });
  }
  return apiPromise;
}

type Options = {
  clip: Clip;
  lang: Language;
  rate: number;
  replayToken: number;
};

export function useYouTubePlayer({ clip, lang, rate, replayToken }: Options) {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const optionsRef = useRef({ clip, lang, rate, replayToken });
  const playedKey = useRef('');
  optionsRef.current = { clip, lang, rate, replayToken };

  const applyRef = useRef<() => void>(() => {});
  applyRef.current = () => {
    const player = playerRef.current;
    if (!player?.loadVideoById) return;

    const current = optionsRef.current;
    const key = `${current.clip.videoId}:${current.clip.startSeconds}:${current.replayToken}`;
    try {
      if (playedKey.current !== key) {
        playedKey.current = key;
        player.loadVideoById({
          videoId: current.clip.videoId,
          startSeconds: current.clip.startSeconds,
        });
      }
      player.setPlaybackRate(current.rate);
    } catch {
      playedKey.current = '';
    }
  };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const target = document.createElement('div');
    mount.appendChild(target);
    let player: YouTubePlayer | null = null;
    let cancelled = false;

    loadYouTubeApi()
      .then(() => {
        if (cancelled || !window.YT) return;
        const current = optionsRef.current;
        player = new window.YT.Player(target, {
          videoId: current.clip.videoId,
          host: 'https://www.youtube-nocookie.com',
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 1,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            cc_load_policy: 1,
            cc_lang_pref: current.lang,
            start: current.clip.startSeconds,
          },
          events: {
            onReady: (event) => {
              playerRef.current = event.target;
              applyRef.current();
            },
            onStateChange: (event) => {
              if (event.data === window.YT?.PlayerState.PLAYING) {
                try {
                  event.target.setPlaybackRate(optionsRef.current.rate);
                } catch {
                  // The player can ignore rate changes while it is still buffering.
                }
              }
            },
          },
        });
      })
      .catch(() => {
        // The iframe API failed to load. The caption sentence still shows the match.
      });

    return () => {
      cancelled = true;
      playedKey.current = '';
      playerRef.current = null;
      try {
        player?.destroy();
      } catch {
        // The iframe is already gone when the page unmounts mid-load.
      }
      mount.replaceChildren();
    };
  }, [lang]);

  useEffect(() => {
    applyRef.current();
  }, [clip.videoId, clip.startSeconds, replayToken, rate]);

  return mountRef;
}
