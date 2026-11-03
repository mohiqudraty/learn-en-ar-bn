import type { Language } from '../../shared/types';
import { copy } from '../i18n';

type Props = {
  lang: Language;
  value: string;
  loading: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export function SearchBar({ lang, value, loading, onChange, onSubmit }: Props) {
  const labels = copy[lang];

  return (
    <form
      className="search-bar"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={labels.placeholder}
        aria-label={labels.placeholder}
        enterKeyHint="search"
        maxLength={120}
      />
      <button type="submit" disabled={loading}>
        {labels.search}
      </button>
    </form>
  );
}
