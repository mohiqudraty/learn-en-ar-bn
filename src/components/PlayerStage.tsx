import type { Clip, Language } from '../../shared/types';
import { useYouTubePlayer } from '../hooks/useYouTubePlayer';

type Props = {
  clip: Clip;
  lang: Language;
  rate: number;
  replayToken: number;
};

export function PlayerStage({ clip, lang, rate, replayToken }: Props) {
  const mountRef = useYouTubePlayer({ clip, lang, rate, replayToken });

  return <div className="player-frame" ref={mountRef} />;
}
