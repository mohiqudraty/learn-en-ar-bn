import type { Language } from '../../shared/types';
import { copy } from '../i18n';

const RATES = [0.75, 1, 1.25] as const;

type Props = {
  lang: Language;
  index: number;
  total: number;
  rate: number;
  onPrevious: () => void;
  onNext: () => void;
  onReplay: () => void;
  onRate: (rate: number) => void;
};

export function PlayerControls({ lang, index, total, rate, onPrevious, onNext, onReplay, onRate }: Props) {
  const labels = copy[lang];

  return (
    <div className="controls">
      <div className="transport">
        <button type="button" onClick={onPrevious} disabled={index === 0}>
          {labels.previous}
        </button>
        <button type="button" className="primary" onClick={onReplay}>
          {labels.replay}
        </button>
        <button type="button" onClick={onNext} disabled={index >= total - 1}>
          {labels.next}
        </button>
      </div>
      <p className="count" dir="ltr">
        {index + 1} / {total}
      </p>
      <div className="speeds" dir="ltr" role="group" aria-label="Playback speed">
        {RATES.map((value) => (
          <button key={value} type="button" aria-pressed={rate === value} onClick={() => onRate(value)}>
            {value}
          </button>
        ))}
      </div>
    </div>
  );
}
