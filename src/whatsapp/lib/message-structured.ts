import {
  getContentType,
  normalizeMessageContent,
  type WAMessage,
} from 'baileys';

export interface StructuredWhatsappMessageContent {
  type: string;
  content: string | null;
  metadata: Record<string, unknown> | null;
}

type LongLike = { toString(): string };

function serializeUnixSeconds(value: number | LongLike | null | undefined) {
  if (value == null) {
    return null;
  }

  const numericValue =
    typeof value === 'object' ? Number(value.toString()) : value;
  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return new Date(numericValue * 1000).toISOString();
}

function serializeLongLike(value: number | LongLike | null | undefined) {
  if (value == null) {
    return null;
  }

  return typeof value === 'object' ? value.toString() : value;
}

function extractPollMessage(message: Record<string, any> | undefined) {
  const poll =
    message?.pollCreationMessage ??
    message?.pollCreationMessageV2 ??
    message?.pollCreationMessageV3 ??
    message?.pollCreationMessageV5;

  if (!poll) {
    return null;
  }

  const options = Array.isArray(poll.options)
    ? poll.options.map((option: Record<string, unknown>) => ({
        optionName: option.optionName ?? null,
        optionHash: option.optionHash ?? null,
      }))
    : [];

  return {
    type: 'poll',
    content: poll.name ?? null,
    metadata: {
      name: poll.name ?? null,
      selectableOptionsCount: poll.selectableOptionsCount ?? null,
      pollContentType: poll.pollContentType ?? null,
      pollType: poll.pollType ?? null,
      correctAnswer: poll.correctAnswer
        ? {
            optionName: poll.correctAnswer.optionName ?? null,
            optionHash: poll.correctAnswer.optionHash ?? null,
          }
        : null,
      options,
    },
  } satisfies StructuredWhatsappMessageContent;
}

export function extractStructuredMessageContent(
  message: WAMessage,
): StructuredWhatsappMessageContent | null {
  const normalizedMessage =
    normalizeMessageContent(message.message) ?? undefined;
  const contentType = getContentType(normalizedMessage) ?? null;

  if (!normalizedMessage || !contentType) {
    return null;
  }

  if (contentType === 'locationMessage') {
    const location = normalizedMessage.locationMessage;
    return {
      type: 'location',
      content: location?.name ?? location?.address ?? location?.comment ?? null,
      metadata: {
        degreesLatitude: location?.degreesLatitude ?? null,
        degreesLongitude: location?.degreesLongitude ?? null,
        name: location?.name ?? null,
        address: location?.address ?? null,
        url: location?.url ?? null,
        isLive: location?.isLive ?? null,
        accuracyInMeters: location?.accuracyInMeters ?? null,
        speedInMps: location?.speedInMps ?? null,
        degreesClockwiseFromMagneticNorth:
          location?.degreesClockwiseFromMagneticNorth ?? null,
        comment: location?.comment ?? null,
      },
    };
  }

  if (contentType === 'liveLocationMessage') {
    const location = normalizedMessage.liveLocationMessage;
    return {
      type: 'live_location',
      content: location?.caption ?? null,
      metadata: {
        degreesLatitude: location?.degreesLatitude ?? null,
        degreesLongitude: location?.degreesLongitude ?? null,
        accuracyInMeters: location?.accuracyInMeters ?? null,
        speedInMps: location?.speedInMps ?? null,
        degreesClockwiseFromMagneticNorth:
          location?.degreesClockwiseFromMagneticNorth ?? null,
        caption: location?.caption ?? null,
        sequenceNumber: serializeLongLike(location?.sequenceNumber),
        timeOffset: location?.timeOffset ?? null,
      },
    };
  }

  if (contentType === 'contactMessage') {
    const contact = normalizedMessage.contactMessage;
    return {
      type: 'contact',
      content: contact?.displayName ?? null,
      metadata: {
        displayName: contact?.displayName ?? null,
        vcard: contact?.vcard ?? null,
      },
    };
  }

  if (contentType === 'contactsArrayMessage') {
    const contacts = normalizedMessage.contactsArrayMessage;
    return {
      type: 'contacts',
      content: contacts?.displayName ?? null,
      metadata: {
        displayName: contacts?.displayName ?? null,
        contacts: Array.isArray(contacts?.contacts)
          ? contacts.contacts.map((contact) => ({
              displayName: contact.displayName ?? null,
              vcard: contact.vcard ?? null,
            }))
          : [],
      },
    };
  }

  if (
    contentType === 'pollCreationMessage' ||
    contentType === 'pollCreationMessageV2' ||
    contentType === 'pollCreationMessageV3' ||
    contentType === 'pollCreationMessageV5'
  ) {
    return extractPollMessage(normalizedMessage);
  }

  if (contentType === 'eventMessage') {
    const event = normalizedMessage.eventMessage;
    return {
      type: 'event',
      content: event?.name ?? event?.description ?? null,
      metadata: {
        name: event?.name ?? null,
        description: event?.description ?? null,
        isCanceled: event?.isCanceled ?? null,
        joinLink: event?.joinLink ?? null,
        startTime: serializeUnixSeconds(event?.startTime),
        endTime: serializeUnixSeconds(event?.endTime),
        extraGuestsAllowed: event?.extraGuestsAllowed ?? null,
        isScheduleCall: event?.isScheduleCall ?? null,
        hasReminder: event?.hasReminder ?? null,
        reminderOffsetSec: serializeLongLike(event?.reminderOffsetSec),
        location: event?.location
          ? {
              degreesLatitude: event.location.degreesLatitude ?? null,
              degreesLongitude: event.location.degreesLongitude ?? null,
              name: event.location.name ?? null,
              address: event.location.address ?? null,
              url: event.location.url ?? null,
            }
          : null,
      },
    };
  }

  return null;
}
