import { supabase } from '@/integrations/supabase/client';

/** Ticket payload from lookup_ticket_for_scan (matches EventScanTab embed shape). */
export type ScanLookupTicket = Record<string, unknown>;

export async function lookupTicketForScan(
  eventId: string,
  identifier: string
): Promise<ScanLookupTicket | null> {
  const { data, error } = await supabase.rpc('lookup_ticket_for_scan' as never, {
    p_event_id: eventId,
    p_identifier: identifier.trim(),
  } as never);

  if (error) {
    throw new Error(error.message || 'Failed to lookup ticket');
  }

  if (!data) {
    return null;
  }

  return data as ScanLookupTicket;
}

export async function scanTicketByQrCode(qrCode: string): Promise<string> {
  const { data, error } = await supabase.rpc('scan_ticket' as never, {
    p_qr_code: qrCode,
  } as never);

  if (error) {
    throw new Error(error.message || 'Failed to check in ticket');
  }

  if (!data) {
    throw new Error('Failed to check in ticket');
  }

  return data as string;
}
