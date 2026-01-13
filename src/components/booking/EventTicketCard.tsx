/**
 * EventTicketCard - Reusable ticket card component
 * Used for:
 * - Page 5 (Successful Booking) display
 * - PDF download
 * - Confirmation email rendering
 */

import { QRCodeSVG } from 'qrcode.react';
import { formatEventDate, formatEventTime } from '@/lib/utils/datetime';
import { Card, CardContent } from '@/components/ui/card';

const BRAND = {
  green: "#0E7A3A",
  greenSoft: "#2F9B63",
  beige: "#F4EFE9",
  beigeSoft: "#FBF8F4",
  dark: "#0F1F17",
};

export interface EventTicketCardProps {
  // Event info
  eventTitle: string;
  eventCategory?: string | null;
  eventAddress?: string | null;
  venueName?: string | null;
  eventDate: string; // ISO date string
  eventTime: string; // ISO date string (end time)
  eventStartTime: string; // ISO date string (start time)
  coverImageUrl?: string | null;
  
  // Booking info
  bookingCode: string; // order.order_no
  qrCode: string; // tickets.qr_code
  
  // Styling
  className?: string;
  showQR?: boolean; // Default true, set to false for email rendering
}

export default function EventTicketCard({
  eventTitle,
  eventCategory,
  eventAddress,
  venueName,
  eventDate,
  eventTime,
  eventStartTime,
  coverImageUrl,
  bookingCode,
  qrCode,
  className = '',
  showQR = true,
}: EventTicketCardProps) {
  const formattedDate = formatEventDate(eventDate);
  const formattedTime = formatEventTime(eventStartTime, eventTime);

  return (
    <Card 
      className={`overflow-hidden ${className}`}
      style={{ 
        borderColor: 'rgba(14,122,58,0.14)',
        backgroundColor: BRAND.beigeSoft,
      }}
    >
      <CardContent className="p-0">
        {/* Cover Image (optional) */}
        {coverImageUrl && (
          <div className="w-full aspect-[16/9] overflow-hidden">
            <img
              src={coverImageUrl}
              alt={eventTitle}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Category (optional) */}
          {eventCategory && (
            <div className="text-xs font-medium uppercase tracking-wider" style={{ color: BRAND.green }}>
              {eventCategory}
            </div>
          )}

          {/* Event Title */}
          <h2 className="text-2xl font-bold" style={{ color: BRAND.dark, fontFamily: "'Inter Tight', sans-serif" }}>
            {eventTitle}
          </h2>

          {/* Event Details */}
          <div className="space-y-2">
            {/* Address */}
            {eventAddress && (
              <div className="flex items-start gap-2">
                <span className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                  📍 {eventAddress}
                </span>
              </div>
            )}

            {/* Venue Name */}
            {venueName && (
              <div className="flex items-start gap-2">
                <span className="text-sm font-medium" style={{ color: BRAND.dark }}>
                  {venueName}
                </span>
              </div>
            )}

            {/* Date */}
            <div className="flex items-start gap-2">
              <span className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                📅 {formattedDate}
              </span>
            </div>

            {/* Time */}
            <div className="flex items-start gap-2">
              <span className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                🕐 {formattedTime}
              </span>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t pt-4" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
            {/* Booking Code */}
            <div className="mb-4">
              <p className="text-xs text-muted-foreground mb-1">Booking Code</p>
              <p className="text-lg font-bold font-mono" style={{ color: BRAND.green }}>
                {bookingCode}
              </p>
            </div>

            {/* QR Code */}
            {showQR && qrCode && (
              <div className="flex flex-col items-center gap-2">
                <div className="p-3 bg-white rounded-lg border" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                  <QRCodeSVG
                    value={qrCode}
                    size={160}
                    level="M"
                    includeMargin={false}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Show this QR code at the event
                </p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

