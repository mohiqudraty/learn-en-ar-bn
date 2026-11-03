import type { Language, SearchErrorCode, SearchNotice } from '../../shared/types';
import { statusText } from '../i18n';

type Props = {
  lang: Language;
  phase: 'idle' | 'loading' | 'empty' | 'error';
  notice: SearchNotice | null;
  errorCode: SearchErrorCode | null;
};

export function StatusMessage({ lang, phase, notice, errorCode }: Props) {
  return <p className={`status ${phase}`}>{statusText(lang, phase, notice, errorCode)}</p>;
}
