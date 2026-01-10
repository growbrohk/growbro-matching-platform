import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { formatMessageTime } from '@/lib/utils/datetime';

export interface MessageEnquiryRowData {
  conversation_id: string;
  other_org_id: string;
  other_org_name: string;
  other_org_logo_url: string | null;
  last_message_body: string;
  last_message_at: string;
  unread_count: number;
}

interface MessageEnquiryRowProps {
  data: MessageEnquiryRowData;
}

export default function MessageEnquiryRow({ data }: MessageEnquiryRowProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/messages/${data.conversation_id}`);
  };

  // Get initials for fallback avatar
  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const initials = getInitials(data.other_org_name);

  // Format unread count (cap at 99+)
  const displayUnreadCount = data.unread_count > 99 ? '99+' : data.unread_count.toString();

  return (
    <div
      onClick={handleClick}
      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 active:bg-muted transition-colors rounded-lg"
    >
      {/* Left: Avatar */}
      <div className="flex-shrink-0">
        <Avatar className="h-12 w-12">
          {data.other_org_logo_url ? (
            <AvatarImage src={data.other_org_logo_url} alt={data.other_org_name} />
          ) : null}
          <AvatarFallback className="bg-muted text-muted-foreground">
            {initials}
          </AvatarFallback>
        </Avatar>
      </div>

      {/* Middle: Name + Preview */}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate" style={{ color: '#0F1F17' }}>
          {data.other_org_name}
        </div>
        <div className="text-sm text-muted-foreground truncate mt-0.5">
          {data.last_message_body || 'No messages'}
        </div>
      </div>

      {/* Right: Time + Unread Badge */}
      <div className="flex-shrink-0 flex flex-col items-end gap-1">
        {/* Time */}
        <div className="text-xs text-muted-foreground whitespace-nowrap">
          {formatMessageTime(data.last_message_at)}
        </div>
        
        {/* Unread Badge */}
        {data.unread_count > 0 && (
          <Badge
            className="h-5 min-w-5 px-1.5 rounded-full bg-green-600 hover:bg-green-600 text-white text-xs font-medium flex items-center justify-center"
          >
            {displayUnreadCount}
          </Badge>
        )}
      </div>
    </div>
  );
}

