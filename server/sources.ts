import type { Language } from '../shared/types';

export type OfficialChannel = {
  id: string;
  name: string;
};

export type SourceProfile = {
  regions: string[];
  channels?: OfficialChannel[];
  blockedTitle: RegExp;
};

export type SearchStep =
  | { kind: 'region'; regionCode: string }
  | { kind: 'channel'; channel: OfficialChannel };

export const RESULT_LIMIT = 15;
export const MATCH_TARGET = 8;

const BENGALI_CHANNELS: OfficialChannel[] = [
  { id: 'UChPD2BQ2dJ-w00klQQkc-Qg', name: 'BBC News বাংলা' },
  { id: 'UCIIkOzwZIdLfHa4Q13dQrkw', name: 'DW বাংলা' },
  { id: 'UCzMeQSfaUSSuA4MgZ2wlT1Q', name: 'VOA বাংলা' },
  { id: 'UClzwimpLoZu9us9MwalLbtA', name: 'Bangladesh Television' },
  { id: 'UCMvm1d__UXVUCIdZRkDpFDQ', name: 'Bangladesh Betar Dhaka' },
];

export const sourceProfiles: Record<Language, SourceProfile> = {
  en: {
    regions: ['US', 'GB'],
    blockedTitle: /prank|meme|\bshorts\b|lyric video|official music video|official video|vevo|\blyrics\b|cartoon|anime|nursery|\bkids\b|peppa|cocomelon|lullaby|karaoke|music video/i,
  },
  ar: {
    regions: ['SA'],
    blockedTitle: /prank|meme|\bshorts\b|أغني|اغني|كليب|موسيقى|نشيد|nasheed|music video|official video|lyrics|vevo|\| audio|كرتون|كارتون|أطفال|اطفال|أنمي|انمي/i,
  },
  bn: {
    regions: ['BD'],
    blockedTitle: /prank|meme|\bshorts\b|মিউজিক|কার্টুন|ছড়া|কিডস|peppa|cocomelon|cartoon|anime|nursery/i,
    channels: BENGALI_CHANNELS,
  },
};

export function searchSteps(lang: Language): SearchStep[] {
  const profile = sourceProfiles[lang];
  if (profile.channels) {
    return profile.channels.map((channel) => ({ kind: 'channel', channel }));
  }
  return profile.regions.map((regionCode) => ({ kind: 'region', regionCode }));
}

export function stepLabel(step: SearchStep): string {
  return step.kind === 'channel' ? step.channel.name : step.regionCode;
}

export function isBlockedTitle(lang: Language, title: string, channelTitle: string): boolean {
  const pattern = sourceProfiles[lang].blockedTitle;
  return pattern.test(title) || pattern.test(channelTitle);
}
