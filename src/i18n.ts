import type { Language, SearchErrorCode, SearchNotice } from '../shared/types';

type Copy = {
  tagline: string;
  interfaceLabel: string;
  clipLabel: string;
  placeholder: string;
  search: string;
  previous: string;
  replay: string;
  next: string;
  idle: string;
  loading: string;
  no_videos: string;
  no_caption_match: string;
  bad_request: string;
  config: string;
  quota: string;
  api: string;
  captions_unavailable: string;
};

export const copy: Record<Language, Copy> = {
  en: {
    tagline: 'Hear a word the way people actually say it.',
    interfaceLabel: 'Interface',
    clipLabel: 'Clips',
    placeholder: 'Search a word or sentence',
    search: 'Search',
    previous: 'Previous',
    replay: 'Replay',
    next: 'Next',
    idle: 'Search a word or short sentence. MoHi plays a real clip and starts just before it is spoken.',
    loading: 'Looking through captioned videos…',
    no_videos: 'No matching clips came back from those sources.',
    no_caption_match: 'Videos came back, but none of their captions contain that phrase.',
    bad_request: 'Enter a word or sentence up to 120 characters.',
    config: 'The server is missing a YouTube API key.',
    quota: 'YouTube’s daily search limit was reached. Try again tomorrow.',
    api: 'YouTube search failed. Try again in a moment.',
    captions_unavailable: 'Those videos did not expose public captions. Try another word.',
  },
  ar: {
    tagline: 'اسمع الكلمة كما يقولها الناس فعلاً.',
    interfaceLabel: 'الواجهة',
    clipLabel: 'المقاطع',
    placeholder: 'ابحث عن كلمة أو جملة',
    search: 'بحث',
    previous: 'السابق',
    replay: 'إعادة',
    next: 'التالي',
    idle: 'ابحث عن كلمة أو جملة قصيرة. يشغّل MoHi مقطعاً حقيقياً ويبدأ قبل نطقها بقليل.',
    loading: 'نبحث في مقاطع فيها ترجمة…',
    no_videos: 'لم تُرجع مقاطع مطابقة من هذه المصادر.',
    no_caption_match: 'ظهرت مقاطع، لكن ترجمتها لا تحتوي هذه العبارة.',
    bad_request: 'أدخل كلمة أو جملة لا تزيد عن ١٢٠ حرفاً.',
    config: 'مفتاح يوتيوب غير موجود في الخادم.',
    quota: 'تم بلوغ حد البحث اليومي في يوتيوب. حاول غداً.',
    api: 'فشل البحث في يوتيوب. حاول بعد قليل.',
    captions_unavailable: 'لم تتوفر ترجمة عامة لهذه المقاطع. جرّب كلمة أخرى.',
  },
  bn: {
    tagline: 'মানুষ যেভাবে বলে, সেভাবে শুনুন।',
    interfaceLabel: 'ইন্টারফেস',
    clipLabel: 'ক্লিপ',
    placeholder: 'একটি শব্দ বা বাক্য খুঁজুন',
    search: 'খুঁজুন',
    previous: 'আগের',
    replay: 'আবার',
    next: 'পরের',
    idle: 'একটি শব্দ বা ছোট বাক্য খুঁজুন। MoHi আসল ক্লিপ চালায় এবং সেটি বলার ঠিক আগে থেকে শুরু করে।',
    loading: 'ক্যাপশনযুক্ত ভিডিও খোঁজা হচ্ছে…',
    no_videos: 'এই সোর্সগুলোতে কোনো মিলে যাওয়া ক্লিপ পাওয়া যায়নি।',
    no_caption_match: 'ভিডিও এসেছে, কিন্তু সেগুলোর ক্যাপশনে এই কথা নেই।',
    bad_request: '১২০ অক্ষরের মধ্যে একটি শব্দ বা বাক্য লিখুন।',
    config: 'সার্ভারে ইউটিউব এপিআই কী নেই।',
    quota: 'ইউটিউবের আজকের খোঁজের সীমা শেষ। আগামীকাল আবার চেষ্টা করুন।',
    api: 'ইউটিউব খোঁজ ব্যর্থ হয়েছে। একটু পরে আবার চেষ্টা করুন।',
    captions_unavailable: 'এই ভিডিওগুলোর প্রকাশ্য ক্যাপশন পাওয়া যায়নি। অন্য শব্দ চেষ্টা করুন।',
  },
};

export function statusText(
  lang: Language,
  phase: 'idle' | 'loading' | 'empty' | 'error',
  notice: SearchNotice | null,
  errorCode: SearchErrorCode | null,
): string {
  const text = copy[lang];
  if (phase === 'loading') return text.loading;
  if (phase === 'idle') return text.idle;
  if (phase === 'empty') return notice === 'no_caption_match' ? text.no_caption_match : text.no_videos;
  return text[errorCode ?? 'api'];
}
