import { formatEventDate, formatEventTime } from '@/lib/utils/datetime';

export type TimeSlotKey = 'day_1' | 'day_2' | 'day_3' | 'day_4';
export type ValidForDays = TimeSlotKey | 'both' | 'all';

export interface EventTimeSlotFields {
  start_at: string;
  end_at: string;
  day_2_start_at?: string | null;
  day_2_end_at?: string | null;
  day_3_start_at?: string | null;
  day_3_end_at?: string | null;
  day_4_start_at?: string | null;
  day_4_end_at?: string | null;
}

export interface ConfiguredTimeSlot {
  key: TimeSlotKey;
  slotNumber: number;
  startAt: string;
  endAt: string;
}

const SLOT_FIELD_MAP: { key: TimeSlotKey; slotNumber: number; startKey: keyof EventTimeSlotFields; endKey: keyof EventTimeSlotFields }[] = [
  { key: 'day_1', slotNumber: 1, startKey: 'start_at', endKey: 'end_at' },
  { key: 'day_2', slotNumber: 2, startKey: 'day_2_start_at', endKey: 'day_2_end_at' },
  { key: 'day_3', slotNumber: 3, startKey: 'day_3_start_at', endKey: 'day_3_end_at' },
  { key: 'day_4', slotNumber: 4, startKey: 'day_4_start_at', endKey: 'day_4_end_at' },
];

export function getConfiguredTimeSlots(event: EventTimeSlotFields): ConfiguredTimeSlot[] {
  return SLOT_FIELD_MAP.flatMap(({ key, slotNumber, startKey, endKey }) => {
    const startAt = event[startKey];
    const endAt = event[endKey];
    if (typeof startAt === 'string' && typeof endAt === 'string' && startAt && endAt) {
      return [{ key, slotNumber, startAt, endAt }];
    }
    return [];
  });
}

export function hasMultipleTimeSlots(event: EventTimeSlotFields): boolean {
  return getConfiguredTimeSlots(event).length > 1;
}

export function getEffectiveEventEnd(event: EventTimeSlotFields): string {
  const slots = getConfiguredTimeSlots(event);
  if (slots.length === 0) return event.end_at;
  return slots.reduce((latest, slot) =>
    new Date(slot.endAt).getTime() > new Date(latest).getTime() ? slot.endAt : latest,
    slots[0].endAt
  );
}

export function getEffectiveEventEndDate(event: EventTimeSlotFields): Date {
  return new Date(getEffectiveEventEnd(event));
}

function isAllSlotsValue(validForDays: ValidForDays): boolean {
  return validForDays === 'all' || validForDays === 'both';
}

export function getValidEndTimestamp(
  event: EventTimeSlotFields,
  validForDays?: ValidForDays | string | null
): number {
  const validFor = (validForDays || 'day_1') as ValidForDays;
  const slots = getConfiguredTimeSlots(event);

  if (slots.length <= 1 || validFor === 'day_1') {
    return new Date(event.end_at).getTime();
  }

  if (isAllSlotsValue(validFor)) {
    return Math.max(...slots.map((slot) => new Date(slot.endAt).getTime()));
  }

  const slot = slots.find((s) => s.key === validFor);
  if (slot) {
    return new Date(slot.endAt).getTime();
  }

  return new Date(event.end_at).getTime();
}

export function getValidForDaysLabel(value: ValidForDays | string | null | undefined): string {
  const validFor = (value || 'day_1') as ValidForDays;
  if (validFor === 'all' || validFor === 'both') {
    return 'All time slots';
  }
  const slotNumber = validFor.replace('day_', '');
  return `Time Slot ${slotNumber} only`;
}

export function getValidForDaysOptions(
  slots: ConfiguredTimeSlot[]
): { value: ValidForDays; label: string }[] {
  const options = slots.map((slot) => ({
    value: slot.key,
    label: `Time Slot ${slot.slotNumber} only`,
  }));
  if (slots.length > 1) {
    options.push({ value: 'all', label: 'All time slots' });
  }
  return options;
}

export function formatSlotRange(startAt: string, endAt: string): string {
  return `${formatEventDate(startAt)} ${formatEventTime(startAt, endAt)}`;
}

export function formatEventDateTimeMultiDayFromEvent(event: EventTimeSlotFields): string {
  const slots = getConfiguredTimeSlots(event);
  return slots.map((slot) => formatSlotRange(slot.startAt, slot.endAt)).join(', ');
}

export function formatTicketTypeDateTimeFromEvent(
  event: EventTimeSlotFields,
  ticketType: { valid_for_days?: ValidForDays | string | null }
): string {
  const validFor = (ticketType.valid_for_days || 'day_1') as ValidForDays;
  const slots = getConfiguredTimeSlots(event);

  if (slots.length <= 1 || validFor === 'day_1') {
    return formatSlotRange(event.start_at, event.end_at);
  }

  if (isAllSlotsValue(validFor)) {
    return slots.map((slot) => formatSlotRange(slot.startAt, slot.endAt)).join(', ');
  }

  const slot = slots.find((s) => s.key === validFor);
  if (slot) {
    return formatSlotRange(slot.startAt, slot.endAt);
  }

  return formatSlotRange(event.start_at, event.end_at);
}

export function validForDaysReferencesRemovedSlot(
  validForDays: ValidForDays | string | null | undefined,
  removedSlotKey: TimeSlotKey
): boolean {
  const validFor = validForDays || 'day_1';
  if (validFor === removedSlotKey) return true;
  if (isAllSlotsValue(validFor)) return true;
  const removedNumber = parseInt(removedSlotKey.replace('day_', ''), 10);
  const validNumber = parseInt(String(validFor).replace('day_', ''), 10);
  if (!Number.isNaN(validNumber) && validNumber > removedNumber) return true;
  return false;
}

export function getSlotStartAt(
  event: EventTimeSlotFields,
  validForDays?: ValidForDays | string | null
): string {
  const validFor = (validForDays || 'day_1') as ValidForDays;
  const slots = getConfiguredTimeSlots(event);

  if (slots.length <= 1 || validFor === 'day_1') {
    return event.start_at;
  }

  if (isAllSlotsValue(validFor)) {
    return event.start_at;
  }

  const slot = slots.find((s) => s.key === validFor);
  return slot?.startAt ?? event.start_at;
}

export function getDefaultNextSlotTimes(previousEnd: Date): { start: Date; end: Date } {
  const start = new Date(previousEnd);
  start.setDate(start.getDate() + 1);
  start.setHours(14, 0, 0, 0);
  const end = new Date(start);
  end.setHours(18, 0, 0, 0);
  return { start, end };
}

export const OPTIONAL_TIME_SLOT_NUMBERS = [2, 3, 4] as const;

export type OptionalTimeSlotNumber = (typeof OPTIONAL_TIME_SLOT_NUMBERS)[number];

export function getOptionalSlotStateKeys(slotNumber: OptionalTimeSlotNumber): {
  startKey: 'day2StartAt' | 'day3StartAt' | 'day4StartAt';
  endKey: 'day2EndAt' | 'day3EndAt' | 'day4EndAt';
  dbStartKey: 'day_2_start_at' | 'day_3_start_at' | 'day_4_start_at';
  dbEndKey: 'day_2_end_at' | 'day_3_end_at' | 'day_4_end_at';
} {
  switch (slotNumber) {
    case 2:
      return {
        startKey: 'day2StartAt',
        endKey: 'day2EndAt',
        dbStartKey: 'day_2_start_at',
        dbEndKey: 'day_2_end_at',
      };
    case 3:
      return {
        startKey: 'day3StartAt',
        endKey: 'day3EndAt',
        dbStartKey: 'day_3_start_at',
        dbEndKey: 'day_3_end_at',
      };
    case 4:
      return {
        startKey: 'day4StartAt',
        endKey: 'day4EndAt',
        dbStartKey: 'day_4_start_at',
        dbEndKey: 'day_4_end_at',
      };
  }
}
