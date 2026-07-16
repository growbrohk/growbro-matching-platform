import { formatEventDate, formatEventTime } from '@/lib/utils/datetime';

export type TimeSlotKey = 'day_1' | 'day_2' | 'day_3' | 'day_4';
export type ValidForDays = TimeSlotKey | 'both' | 'all' | 'each';
export type SlotCapacities = Partial<Record<TimeSlotKey, number>>;

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
  validForDays?: ValidForDays | string | null,
  explicitTimeSlot?: TimeSlotKey | string | null
): number {
  const slots = getConfiguredTimeSlots(event);
  const slotKey = (explicitTimeSlot || validForDays || 'day_1') as ValidForDays;

  if (explicitTimeSlot && slots.some((s) => s.key === explicitTimeSlot)) {
    const slot = slots.find((s) => s.key === explicitTimeSlot);
    if (slot) return new Date(slot.endAt).getTime();
  }

  const validFor = (validForDays || 'day_1') as ValidForDays;

  if (slots.length <= 1 || validFor === 'day_1') {
    return new Date(event.end_at).getTime();
  }

  if (isAllSlotsValue(validFor)) {
    return Math.max(...slots.map((slot) => new Date(slot.endAt).getTime()));
  }

  if (validFor === 'each' && slotKey !== 'each') {
    const slot = slots.find((s) => s.key === slotKey);
    if (slot) return new Date(slot.endAt).getTime();
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
  if (validFor === 'each') {
    return 'Each time slot';
  }
  const slotNumber = validFor.replace('day_', '');
  return `Time Slot ${slotNumber} only`;
}

export function getValidForDaysOptions(
  slots: ConfiguredTimeSlot[],
  options?: { allowEach?: boolean; allowAll?: boolean }
): { value: ValidForDays; label: string }[] {
  const result = slots.map((slot) => ({
    value: slot.key as ValidForDays,
    label: `Time Slot ${slot.slotNumber} only`,
  }));
  if (slots.length > 1) {
    if (options?.allowEach !== false) {
      result.push({ value: 'each', label: 'Each time slot (separate inventory)' });
    }
    if (options?.allowAll !== false) {
      result.push({ value: 'all', label: 'All time slots' });
    }
  }
  return result;
}

export function formatSlotRange(startAt: string, endAt: string): string {
  return `${formatEventDate(startAt)} ${formatEventTime(startAt, endAt)}`;
}

export function formatEventDateTimeMultiDayFromEvent(event: EventTimeSlotFields): string {
  const slots = getConfiguredTimeSlots(event);
  return slots.map((slot) => formatSlotRange(slot.startAt, slot.endAt)).join(', ');
}

export function formatEventTimeSlotsList(
  event: EventTimeSlotFields
): { key: TimeSlotKey; number: number; label: string }[] {
  return getConfiguredTimeSlots(event).map((slot) => ({
    key: slot.key,
    number: slot.slotNumber,
    label: formatSlotRange(slot.startAt, slot.endAt),
  }));
}

export function isAllAccessValidForDays(value: ValidForDays | string | null | undefined): boolean {
  const validFor = (value || 'day_1') as ValidForDays;
  return validFor === 'all' || validFor === 'both';
}

export interface TicketTypeSlotFields {
  valid_for_days?: ValidForDays | string | null;
  valid_for_slots?: TimeSlotKey[] | null;
  slot_quotas?: Partial<Record<TimeSlotKey, number | string>> | null;
  quota?: number;
}

/** Resolve selected slots from valid_for_slots or legacy valid_for_days / each. */
export function getTicketTypeSelectedSlots(
  ticketType: TicketTypeSlotFields
): TimeSlotKey[] {
  if (isAllAccessValidForDays(ticketType.valid_for_days)) return [];
  if (ticketType.valid_for_slots && ticketType.valid_for_slots.length > 0) {
    return [...ticketType.valid_for_slots].sort();
  }
  if (ticketType.valid_for_days === 'each' && ticketType.slot_quotas) {
    return (Object.keys(ticketType.slot_quotas) as TimeSlotKey[]).filter((k) =>
      /^day_[1-4]$/.test(k)
    ).sort();
  }
  const validFor = (ticketType.valid_for_days || 'day_1') as ValidForDays;
  if (/^day_[1-4]$/.test(validFor)) return [validFor as TimeSlotKey];
  return [];
}

export function ticketTypeUsesPickOneSlots(ticketType: TicketTypeSlotFields): boolean {
  if (isAllAccessValidForDays(ticketType.valid_for_days)) return false;
  return getTicketTypeSelectedSlots(ticketType).length > 0
    || ticketType.valid_for_days === 'each';
}

/** Derive valid_for_days for legacy consumers from slot selection. */
export function deriveValidForDaysFromSlots(
  selectedSlots: TimeSlotKey[],
  isAllAccess: boolean
): ValidForDays {
  if (isAllAccess) return 'all';
  if (selectedSlots.length === 0) return 'day_1';
  if (selectedSlots.length === 1) return selectedSlots[0];
  // Multi pick-one: 'each' keeps per-slot-aware legacy helpers working
  return 'each';
}

export function getSlotAllocation(
  ticketType: TicketTypeSlotFields,
  slotKey: TimeSlotKey
): number | undefined {
  const raw = ticketType.slot_quotas?.[slotKey];
  if (raw != null && raw !== '') {
    const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
    if (!Number.isNaN(n)) return n;
  }
  const slots = getTicketTypeSelectedSlots(ticketType);
  if (slots.length === 1 && slots[0] === slotKey && ticketType.quota != null) {
    return ticketType.quota;
  }
  return undefined;
}

export function getValidForSlotsLabel(
  ticketType: TicketTypeSlotFields,
  configuredSlots?: ConfiguredTimeSlot[]
): string {
  if (isAllAccessValidForDays(ticketType.valid_for_days)) {
    return 'All time slots (one ticket grants every slot)';
  }
  const selected = getTicketTypeSelectedSlots(ticketType);
  if (selected.length === 0) return getValidForDaysLabel(ticketType.valid_for_days);
  if (configuredSlots && selected.length === configuredSlots.length) {
    return 'All configured time slots (pick one at checkout)';
  }
  return selected
    .map((key) => {
      const num = configuredSlots?.find((s) => s.key === key)?.slotNumber
        ?? key.replace('day_', '');
      return `Time Slot ${num}`;
    })
    .join(', ');
}

export function backfillSlotCapacitiesFromTicketTypes(
  configuredSlots: ConfiguredTimeSlot[],
  ticketTypes: TicketTypeSlotFields[],
  existing?: SlotCapacities | null
): SlotCapacities {
  const result: SlotCapacities = { ...(existing ?? {}) };
  configuredSlots.forEach((slot) => {
    if (result[slot.key] != null && result[slot.key]! > 0) return;
    let maxAlloc = 0;
    ticketTypes.forEach((tt) => {
      if (isAllAccessValidForDays(tt.valid_for_days)) return;
      const alloc = getSlotAllocation(tt, slot.key);
      if (alloc != null && alloc > maxAlloc) maxAlloc = alloc;
    });
    result[slot.key] = maxAlloc > 0 ? maxAlloc : 100;
  });
  return result;
}

export function normalizeTicketTypeFromApi(t: TicketTypeSlotFields & {
  valid_for_days?: ValidForDays | string | null;
}): {
  isAllAccess: boolean;
  selectedSlots: TimeSlotKey[];
  slotQuotas: Partial<Record<TimeSlotKey, string>>;
} {
  const isAllAccess = isAllAccessValidForDays(t.valid_for_days);
  const selectedSlots = isAllAccess ? [] : getTicketTypeSelectedSlots(t);
  const slotQuotas: Partial<Record<TimeSlotKey, string>> = {};
  if (!isAllAccess) {
    selectedSlots.forEach((key) => {
      const alloc = getSlotAllocation(t, key);
      if (alloc != null) slotQuotas[key] = String(alloc);
    });
  }
  return { isAllAccess, selectedSlots, slotQuotas };
}

export function buildTicketTypeSlotSavePayload(
  opts: {
    isAllAccess: boolean;
    selectedSlots: TimeSlotKey[];
    slotQuotas: Partial<Record<TimeSlotKey, string>>;
    aggregateQuota: number;
  }
): {
  valid_for_days: ValidForDays;
  valid_for_slots: TimeSlotKey[] | null;
  slot_quotas: Partial<Record<TimeSlotKey, number>> | null;
  quota: number;
} {
  if (opts.isAllAccess) {
    return {
      valid_for_days: 'all',
      valid_for_slots: null,
      slot_quotas: null,
      quota: opts.aggregateQuota,
    };
  }
  const slotQuotasPayload: Partial<Record<TimeSlotKey, number>> = {};
  opts.selectedSlots.forEach((key) => {
    const raw = opts.slotQuotas[key];
    if (raw != null && raw !== '') {
      slotQuotasPayload[key] = parseInt(raw, 10);
    }
  });
  const totalQuota = Object.values(slotQuotasPayload).reduce((sum, n) => sum + n, 0) || opts.aggregateQuota;
  return {
    valid_for_days: deriveValidForDaysFromSlots(opts.selectedSlots, false),
    valid_for_slots: opts.selectedSlots.length > 0 ? opts.selectedSlots : null,
    slot_quotas: Object.keys(slotQuotasPayload).length > 0 ? slotQuotasPayload : null,
    quota: totalQuota,
  };
}

export function getSlotRemainingForTicketType(
  ticketType: {
    valid_for_days?: ValidForDays | string | null;
    valid_for_slots?: TimeSlotKey[] | null;
    slot_remaining?: Partial<Record<TimeSlotKey, number>> | null;
    slot_quotas?: Partial<Record<TimeSlotKey, number>> | null;
    quota?: number;
    remaining_count?: number;
  },
  slotKey: TimeSlotKey
): number | undefined {
  if (ticketType.slot_remaining && ticketType.slot_remaining[slotKey] !== undefined) {
    return ticketType.slot_remaining[slotKey];
  }
  if (ticketTypeUsesPickOneSlots(ticketType) && ticketType.slot_quotas?.[slotKey] != null) {
    return ticketType.slot_quotas[slotKey];
  }
  if (ticketType.remaining_count !== undefined) return ticketType.remaining_count;
  return undefined;
}

export function ticketTypeAppliesToSlot(
  validForDays: ValidForDays | string | null | undefined,
  slotKey: TimeSlotKey,
  validForSlots?: TimeSlotKey[] | null
): boolean {
  if (validForSlots && validForSlots.length > 0) {
    return validForSlots.includes(slotKey);
  }
  const validFor = (validForDays || 'day_1') as ValidForDays;
  if (validFor === 'each') return true;
  if (validFor === slotKey) return true;
  return false;
}

export function formatEventTimeSlotsDisplayText(event: EventTimeSlotFields): string {
  const list = formatEventTimeSlotsList(event);
  if (list.length <= 1) {
    return list[0]?.label ?? formatSlotRange(event.start_at, event.end_at);
  }
  return list.map((slot) => `${slot.number}. ${slot.label}`).join('\n');
}

export function formatTicketTypeDateTimeFromEvent(
  event: EventTimeSlotFields,
  ticketType: { valid_for_days?: ValidForDays | string | null },
  explicitTimeSlot?: TimeSlotKey | null
): string {
  const validFor = (ticketType.valid_for_days || 'day_1') as ValidForDays;
  const slots = getConfiguredTimeSlots(event);

  if (explicitTimeSlot) {
    const slot = slots.find((s) => s.key === explicitTimeSlot);
    if (slot) return formatSlotRange(slot.startAt, slot.endAt);
  }

  if (slots.length <= 1 || validFor === 'day_1') {
    return formatSlotRange(event.start_at, event.end_at);
  }

  if (isAllSlotsValue(validFor)) {
    return slots.map((slot) => formatSlotRange(slot.startAt, slot.endAt)).join(', ');
  }

  if (validFor === 'each' && explicitTimeSlot) {
    const slot = slots.find((s) => s.key === explicitTimeSlot);
    if (slot) return formatSlotRange(slot.startAt, slot.endAt);
  }

  const slot = slots.find((s) => s.key === validFor);
  if (slot) {
    return formatSlotRange(slot.startAt, slot.endAt);
  }

  return formatSlotRange(event.start_at, event.end_at);
}

export function formatSlotDateTimeByKey(
  event: EventTimeSlotFields,
  slotKey: TimeSlotKey
): string {
  const slots = getConfiguredTimeSlots(event);
  const slot = slots.find((s) => s.key === slotKey);
  if (slot) return formatSlotRange(slot.startAt, slot.endAt);
  return formatSlotRange(event.start_at, event.end_at);
}

/** Short label for a purchased slot key, e.g. "Time Slot 2". */
export function formatPurchasedTimeSlotShortLabel(
  timeSlot: TimeSlotKey | string | null | undefined
): string | null {
  if (!timeSlot || !/^day_[1-4]$/.test(timeSlot)) return null;
  const slotNumber = timeSlot.replace('day_', '');
  return `Time Slot ${slotNumber}`;
}

/**
 * Human-readable label for which time slot a ticket was purchased for.
 */
export function formatPurchasedTimeSlotLabel(
  event: EventTimeSlotFields,
  timeSlot: TimeSlotKey | string | null | undefined,
  ticketType?: { valid_for_days?: ValidForDays | string | null }
): string {
  const multi = hasMultipleTimeSlots(event);

  if (!multi) {
    return formatSlotRange(event.start_at, event.end_at);
  }

  if (timeSlot && /^day_[1-4]$/.test(timeSlot)) {
    const key = timeSlot as TimeSlotKey;
    const short = formatPurchasedTimeSlotShortLabel(key);
    const datetime = formatSlotDateTimeByKey(event, key);
    return short ? `${short} — ${datetime}` : datetime;
  }

  if (ticketType && isAllAccessValidForDays(ticketType.valid_for_days)) {
    return 'All time slots';
  }

  return 'All time slots';
}

export function validForDaysReferencesRemovedSlot(
  validForDays: ValidForDays | string | null | undefined,
  removedSlotKey: TimeSlotKey,
  validForSlots?: TimeSlotKey[] | null
): boolean {
  if (validForSlots && validForSlots.length > 0) {
    return validForSlots.includes(removedSlotKey);
  }
  const validFor = validForDays || 'day_1';
  if (validFor === removedSlotKey) return true;
  if (isAllSlotsValue(validFor)) return true;
  if (validFor === 'each') return true;
  const removedNumber = parseInt(removedSlotKey.replace('day_', ''), 10);
  const validNumber = parseInt(String(validFor).replace('day_', ''), 10);
  if (!Number.isNaN(validNumber) && validNumber > removedNumber) return true;
  return false;
}

export function stripSlotFromValidForSlots(
  validForSlots: TimeSlotKey[] | null | undefined,
  removedSlotKey: TimeSlotKey
): TimeSlotKey[] | undefined {
  if (!validForSlots) return undefined;
  const next = validForSlots.filter((k) => k !== removedSlotKey);
  return next.length > 0 ? next : undefined;
}

export function stripSlotFromSlotQuotas(
  slotQuotas: Partial<Record<TimeSlotKey, string | number>> | null | undefined,
  removedSlotKey: TimeSlotKey
): Partial<Record<TimeSlotKey, string>> | undefined {
  if (!slotQuotas) return undefined;
  const next = { ...slotQuotas } as Partial<Record<TimeSlotKey, string>>;
  delete next[removedSlotKey];
  return Object.keys(next).length > 0 ? next : undefined;
}

export function ticketTypeHasSales(
  ticketType: { remaining_count?: number; quota: number }
): boolean {
  if (ticketType.remaining_count === undefined) return false;
  return ticketType.remaining_count < ticketType.quota;
}

export function ticketTypeHasVariantQuotas(
  accessVariants?: { quota?: number | string | null }[] | null
): boolean {
  return (accessVariants || []).some((v) => v.quota != null && v.quota !== '');
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
