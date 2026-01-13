/**
 * TicketCard - Unified ticket card component
 * Single source of truth for ticket display matching reference design exactly
 * Used for:
 * - Booking success page display
 * - PNG download (html2canvas)
 * - Any ticket rendering needs
 */

import { QRCodeSVG } from 'qrcode.react';
import { formatTicketDateTime } from '@/lib/utils/datetime';
import React, { useEffect, useRef, useState } from 'react';

export interface TicketCardProps {
  // Event info
  eventName: string;
  dateTime: string; // ISO date string (start_at)
  venue: string;

  // Ticket info
  checkinCode: string; // order_no or booking code
  qrValue: string; // QR code value (ticket.qr_code)

  // Participant info
  participantName: string; // Full name (first_name + last_name)
  price: number; // Ticket price (0 means FREE)
  seatNumber?: string | null; // Seat number (null/undefined means FREE)

  // Currency for price display
  currency?: string; // Default: 'HKD'

  // Styling
  className?: string;

  // Capture mode - removes extra bottom padding (for isolated capture)
  captureMode?: boolean;
}

/**
 * Format price for display
 * - If price === 0 or null/undefined => "FREE"
 * - Else format with currency symbol
 */
function formatPrice(price: number, currency: string = 'HKD'): string {
  if (!price || price === 0) return 'FREE';

  const currencySymbols: Record<string, string> = {
    HKD: 'HK$',
    USD: '$',
    GBP: '£',
    EUR: '€',
  };

  const symbol = currencySymbols[currency.toUpperCase()] || currency;
  return `${symbol}${price.toFixed(0)}`;
}

/**
 * IMPORTANT:
 * - This component renders a full black frame (full-bleed) + centered white card
 * - The white card is ALWAYS inside the black background (like reference)
 */
export default function TicketCard({
  eventName,
  dateTime,
  venue,
  checkinCode,
  qrValue,
  participantName,
  price,
  seatNumber,
  currency = 'HKD',
  className = '',
  captureMode = false,
}: TicketCardProps) {
  const formattedDateTime = formatTicketDateTime(dateTime);
  const formattedPrice = formatPrice(price, currency);
  const displaySeatNumber = seatNumber || 'FREE';

  return (
    /**
     * FULL-BLEED BLACK:
     * w-screen + left-1/2 -translate-x-1/2 ensures black extends beyond any .container px-4
     */
    <div className={`w-screen relative left-1/2 -translate-x-1/2 bg-black ${className}`}>
      <div className="flex flex-col items-center">
        {/* Top title area (on black) */}
        <div className="w-full flex flex-col items-center pt-10 pb-6 px-4">
          <h1 className="text-[32px] font-extrabold text-white uppercase tracking-tight">
            THIS IS YOUR TICKET
          </h1>
          <p className="text-sm text-white/80 text-center mt-1">
            Please show it on your phone when you arrive at the venue
          </p>
        </div>

        {/* Black padding area that holds the white card */}
        <div className={`w-full flex justify-center px-6 ${captureMode ? 'pb-0' : 'pb-12'}`}>
          {/* White ticket card */}
          <div
            className="bg-white rounded-[28px] shadow-[0_20px_60px_rgba(0,0,0,0.35)] mx-auto"
            style={{ width: 800 }} // fixed like reference
          >
            {/* Header */}
            <div className="flex items-start justify-between px-10 pt-10 pb-6">
              <div className="flex items-center">
                <img
                  src="/growbro-logo-horizontal.png"
                  alt="growbro"
                  className="h-[44px] w-auto"
                  style={{ maxWidth: '240px' }}
                />
              </div>

              <div className="flex flex-col items-end">
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">
                  CHECKIN CODE
                </span>
                <span className="text-2xl font-black text-black">{checkinCode}</span>
              </div>
            </div>

            {/* QR */}
            <div className="flex justify-center px-10 pb-6">
              <div className="p-3 bg-white border-2 border-black rounded-2xl">
                <QRCodeSVG value={qrValue} size={420} level="M" includeMargin={false} />
              </div>
            </div>

            {/* Event info */}
            <div className="px-10 pb-6 space-y-3">
              <div>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">
                  EVENT NAME
                </p>
                <p className="text-[18px] font-extrabold text-black">{eventName}</p>
              </div>

              <div>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">
                  DATE AND TIME
                </p>
                <p className="text-[16px] font-extrabold text-black">{formattedDateTime}</p>
              </div>

              <div>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">
                  VENUE
                </p>
                <p className="text-[16px] font-extrabold text-black">{venue}</p>
              </div>
            </div>

            {/* Perforation line + notches (match reference) */}
            <div className="relative my-4">
              <div className="mx-10 border-t-2 border-dashed border-gray-300" />
              <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black" />
              <div className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black" />
            </div>

            {/* Bottom */}
            <div className="px-10 pb-10 flex items-end justify-between">
              <div className="flex-1 space-y-6">
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">
                    PARTICIPANT NAME
                  </p>
                  <p className="text-[18px] font-extrabold text-black uppercase">{participantName}</p>
                </div>

                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">
                    TICKET PRICE
                  </p>
                  <p className="text-[16px] font-extrabold text-black">{formattedPrice}</p>
                </div>
              </div>

              <div className="flex flex-col items-end">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">
                  SEAT NUMBER
                </p>
                <p className="text-[56px] font-black text-black leading-none">{displaySeatNumber}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * TicketCardPreview - Responsive wrapper for TicketCard
 * Scales down the 800px card on mobile WITHOUT clipping.
 *
 * IMPORTANT:
 * This wrapper must measure height properly (no "magic marginBottom" hack).
 */
export function TicketCardPreview({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ticketRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [wrapperHeight, setWrapperHeight] = useState<number>(0);

  useEffect(() => {
    const update = () => {
      if (!containerRef.current || !ticketRef.current) return;

      const containerWidth = containerRef.current.clientWidth;
      const availableWidth = containerWidth - 32; // safe padding
      const newScale = Math.min(1, availableWidth / 800);

      setScale(newScale);

      // IMPORTANT: use scrollHeight (stable) then multiply by scale
      const h = ticketRef.current.scrollHeight;
      setWrapperHeight(h * newScale);
    };

    update();
    requestAnimationFrame(update);
    setTimeout(update, 100);

    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    if (ticketRef.current) ro.observe(ticketRef.current);

    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="w-full flex justify-center" style={{ height: wrapperHeight || 'auto', overflow: 'visible' }}>
      <div
        ref={ticketRef}
        style={{
          width: 800,
          transform: `scale(${scale})`,
          transformOrigin: 'top center',
        }}
      >
        {children}
      </div>
    </div>
  );
}
