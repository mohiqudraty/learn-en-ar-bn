export type Language = 'en' | 'ar' | 'bn';

export type Clip = {
  videoId: string;
  title: string;
  channelTitle: string;
  startSeconds: number;
  sentence: string;
};

export type SearchNotice = 'no_videos' | 'no_caption_match';

export type SearchSuccess = {
  clips: Clip[];
  notice: SearchNotice | null;
};

export type SearchErrorCode =
  | 'bad_request'
  | 'config'
  | 'quota'
  | 'api'
  | 'captions_unavailable';

export type SearchErrorBody = {
  error: SearchErrorCode;
  message: string;
};
