import type { Language } from '../../shared/types';

const OPTIONS: Array<{ id: Language; label: string }> = [
  { id: 'en', label: 'English' },
  { id: 'ar', label: 'العربية' },
  { id: 'bn', label: 'বাংলা' },
];

type Props = {
  label: string;
  lang: Language;
  onChange: (lang: Language) => void;
};

export function LanguageSwitcher({ label, lang, onChange }: Props) {
  return (
    <div className="language-row">
      <span className="language-label">{label}</span>
      <div className="languages" role="group" aria-label={label}>
        {OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={lang === option.id}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
