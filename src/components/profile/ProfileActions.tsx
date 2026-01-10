import { Button } from '@/components/ui/button';
import { Edit, MessageSquare, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

export interface ProfileActionsProps {
  mode: 'owner' | 'public';
  onEdit?: () => void;
  otherOrgId?: string;
}

export default function ProfileActions({ mode, onEdit, otherOrgId }: ProfileActionsProps) {
  const navigate = useNavigate();

  if (mode === 'owner') {
    return (
      <Button
        onClick={() => {
          if (onEdit) {
            onEdit();
          } else {
            navigate('/app/settings/profile');
          }
        }}
        variant="ghost"
        size="icon"
        className="h-10 w-10"
      >
        <Edit className="h-5 w-5" />
      </Button>
    );
  }

  // Public mode: Connect and Message buttons
  return (
    <div className="flex gap-3 mb-6">
      <Button
        onClick={() => {
          toast.info('Connect feature coming soon');
        }}
        className="flex-1 h-12 rounded-2xl font-bold"
        style={{ backgroundColor: 'rgba(15,31,23,0.1)', color: '#0F1F17' }}
      >
        <UserPlus className="h-4 w-4 mr-2" />
        Connect
      </Button>
      <Button
        onClick={() => {
          if (otherOrgId) {
            navigate(`/messages/new?toOrg=${otherOrgId}`);
          } else {
            toast.error('Organization ID not available');
          }
        }}
        className="flex-1 h-12 rounded-2xl font-bold"
        style={{ backgroundColor: 'rgba(15,31,23,0.1)', color: '#0F1F17' }}
      >
        <MessageSquare className="h-4 w-4 mr-2" />
        Message
      </Button>
    </div>
  );
}

