import {
  getContentType,
  normalizeMessageContent,
  type WAMessage,
} from 'baileys';

export const MEDIA_MESSAGE_TYPES = [
  'imageMessage',
  'videoMessage',
  'audioMessage',
  'documentMessage',
  'stickerMessage',
  'documentWithCaptionMessage',
] as const;

export type SupportedMediaType = (typeof MEDIA_MESSAGE_TYPES)[number];
export type IncomingMediaKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'unknown';

export interface ExtractedMediaInfo {
  type: SupportedMediaType | null;
  kind: IncomingMediaKind;
  mimetype: string | null;
  caption: string | null;
  isMedia: boolean;
  isImage: boolean;
  isVideo: boolean;
  isAudio: boolean;
  isDocument: boolean;
  isSticker: boolean;
}

function isSupportedMediaType(type: string | null): type is SupportedMediaType {
  return Boolean(
    type && MEDIA_MESSAGE_TYPES.includes(type as SupportedMediaType),
  );
}

function getMediaKind(type: SupportedMediaType | null): IncomingMediaKind {
  switch (type) {
    case 'imageMessage':
      return 'image';
    case 'videoMessage':
      return 'video';
    case 'audioMessage':
      return 'audio';
    case 'documentMessage':
    case 'documentWithCaptionMessage':
      return 'document';
    case 'stickerMessage':
      return 'sticker';
    default:
      return 'unknown';
  }
}

export function extractMediaInfo(message: WAMessage): ExtractedMediaInfo {
  const normalizedMessage =
    normalizeMessageContent(message.message) ?? undefined;
  const rawType = getContentType(normalizedMessage) ?? null;
  const type = isSupportedMediaType(rawType) ? rawType : null;
  const content =
    type && normalizedMessage
      ? (normalizedMessage[type as keyof typeof normalizedMessage] as
          | Record<string, unknown>
          | undefined)
      : undefined;

  const kind = getMediaKind(type);
  const mimetype = (content?.mimetype as string | undefined) ?? null;
  const caption = (content?.caption as string | undefined) ?? null;

  return {
    type,
    kind,
    mimetype,
    caption,
    isMedia: Boolean(type),
    isImage: kind === 'image',
    isVideo: kind === 'video',
    isAudio: kind === 'audio',
    isDocument: kind === 'document',
    isSticker: kind === 'sticker',
  };
}
