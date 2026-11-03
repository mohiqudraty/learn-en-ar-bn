import type { Language } from '../../shared/types';
import { splitHighlight } from '../../shared/text';

type Props = {
  sentence: string;
  query: string;
  lang: Language;
};

export function CaptionLine({ sentence, query, lang }: Props) {
  const parts = splitHighlight(sentence, query, lang);

  return (
    <p className="caption" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {parts.map((part, index) =>
        part.match ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>,
      )}
    </p>
  );
}
