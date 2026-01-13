/**
 * TicketImageCard - Single ticket component for image capture
 * Used for generating individual ticket images (PNG) for download
 * This is rendered as a hidden node for html2canvas capture
 */

import { QRCodeSVG } from 'qrcode.react';
import { formatEventDate, formatEventTime } from '@/lib/utils/datetime';

const BRAND = {
  green: "#0E7A3A",
  greenSoft: "#2F9B63",
  beige: "#F4EFE9",
  beigeSoft: "#FBF8F4",
  dark: "#0F1F17",
};

export interface TicketImageCardProps {
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
  bookingCode: string;
  
  // Ticket info
  ticketQrCode: string;
  ticketIndex: number; // 0-based
  ticketCount: number; // Total tickets
  
  // Attendee info
  attendeeName?: string | null;
  attendeeEmail?: string | null;
  
  // Styling
  className?: string;
}

export default function TicketImageCard({
  eventTitle,
  eventCategory,
  eventAddress,
  venueName,
  eventDate,
  eventTime,
  eventStartTime,
  coverImageUrl,
  bookingCode,
  ticketQrCode,
  ticketIndex,
  ticketCount,
  attendeeName,
  attendeeEmail,
  className = '',
}: TicketImageCardProps) {
  const formattedDate = formatEventDate(eventDate);
  const formattedTime = formatEventTime(eventStartTime, eventTime);

  return (
    <div 
      className={`overflow-hidden ${className}`}
      style={{ 
        width: '800px', // Fixed width for consistent capture
        border: '1px solid rgba(14,122,58,0.14)',
        borderRadius: '1rem',
        backgroundColor: BRAND.beigeSoft,
        padding: '2rem',
      }}
    >
      {/* Cover Image (optional) */}
      {coverImageUrl && (
        <div className="w-full aspect-[16/9] overflow-hidden mb-4 rounded-lg">
          <img
            src={coverImageUrl}
            alt={eventTitle}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Content */}
      <div className="space-y-4">
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
          {/* Ticket Number */}
          {ticketCount > 1 && (
            <div className="mb-4 text-center">
              <p className="text-sm font-medium text-muted-foreground">
                Ticket {ticketIndex + 1} / {ticketCount}
              </p>
            </div>
          )}

          {/* QR Code */}
          <div className="flex flex-col items-center gap-3 mb-4">
            <div className="p-4 bg-white rounded-lg border" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
              <QRCodeSVG
                value={ticketQrCode}
                size={200}
                level="M"
                includeMargin={false}
              />
            </div>
            
            {/* Attendee name/email */}
            {(attendeeName || attendeeEmail) && (
              <div className="text-center">
                {attendeeName && (
                  <p className="text-sm font-medium" style={{ color: BRAND.dark }}>
                    {attendeeName}
                  </p>
                )}
                {attendeeEmail && (
                  <p className="text-xs text-muted-foreground">
                    {attendeeEmail}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Booking Code */}
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Booking Code</p>
            <p className="text-lg font-bold font-mono" style={{ color: BRAND.green }}>
              {bookingCode}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

