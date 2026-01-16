import { Button } from '@/components/ui/button';
import { Edit, MessageSquare, UserPlus, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ProfileActionsProps {
  mode: 'owner' | 'public';
  onEdit?: () => void;
  otherOrgId?: string;
}

type ConnectionStatus = 'none' | 'outgoing_pending' | 'incoming_pending' | 'accepted' | 'blocked';

interface ConnectionStatusData {
  connection_id: string;
  status: string;
  requested_by_org_id: string;
}

export default function ProfileActions({ mode, onEdit, otherOrgId }: ProfileActionsProps) {
  const navigate = useNavigate();
  const { currentOrg } = useAuth();
  const queryClient = useQueryClient();

  // Fetch connection status
  const { data: connectionStatusData, isLoading: isLoadingStatus } = useQuery({
    queryKey: ['connectionStatus', currentOrg?.id, otherOrgId],
    queryFn: async (): Promise<ConnectionStatusData | null> => {
      if (!currentOrg || !otherOrgId) return null;

      const { data, error } = await (supabase.rpc as any)('get_connection_status', {
        p_my_org_id: currentOrg.id,
        p_target_org_id: otherOrgId,
      });

      if (error) {
        console.error('Error fetching connection status:', error);
        return null;
      }

      // RPC returns array, get first result or null
      return (data && data.length > 0) ? data[0] : null;
    },
    enabled: mode === 'public' && !!currentOrg && !!otherOrgId && currentOrg.id !== otherOrgId,
  });

  // Compute connection state
  const getConnectionState = (): ConnectionStatus => {
    if (!connectionStatusData || !currentOrg) return 'none';
    
    const { status, requested_by_org_id } = connectionStatusData;
    
    if (status === 'pending') {
      return requested_by_org_id === currentOrg.id ? 'outgoing_pending' : 'incoming_pending';
    }
    
    if (status === 'accepted') return 'accepted';
    if (status === 'blocked') return 'blocked';
    if (status === 'rejected') return 'none'; // Treat rejected as can re-request
    
    return 'none';
  };

  const connectionState = getConnectionState();
  const connectionId = connectionStatusData?.connection_id;

  // Request connection mutation
  const requestConnectionMutation = useMutation({
    mutationFn: async () => {
      if (!currentOrg || !otherOrgId) {
        throw new Error('Missing org information');
      }

      const { data, error } = await (supabase.rpc as any)('request_connection', {
        p_requester_org_id: currentOrg.id,
        p_target_org_id: otherOrgId,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Connection request sent');
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['connectionStatus', currentOrg?.id, otherOrgId] });
      queryClient.invalidateQueries({ queryKey: ['pending-connections-count', currentOrg?.id] });
      if (otherOrgId) {
        queryClient.invalidateQueries({ queryKey: ['pending-connections-count', otherOrgId] });
        queryClient.invalidateQueries({ queryKey: ['connected-count', otherOrgId] });
      }
      queryClient.invalidateQueries({ queryKey: ['connected-count', currentOrg?.id] });
      queryClient.invalidateQueries({ queryKey: ['connected-orgs', currentOrg?.id] });
    },
    onError: (error: any) => {
      const errorMessage = error.message || 'Failed to send connection request';
      if (errorMessage.includes('already connected')) {
        toast.error('Already connected');
      } else if (errorMessage.includes('already pending')) {
        toast.error('Connection request already pending');
      } else if (errorMessage.includes('blocked')) {
        toast.error('Connection is blocked');
      } else {
        toast.error(errorMessage);
      }
    },
  });

  // Respond to connection mutation
  const respondToConnectionMutation = useMutation({
    mutationFn: async (action: 'accept' | 'reject') => {
      if (!connectionId) {
        throw new Error('Connection ID not available');
      }

      const { error } = await (supabase.rpc as any)('respond_to_connection', {
        p_connection_id: connectionId,
        p_action: action,
      });

      if (error) throw error;
    },
    onSuccess: (_, action) => {
      if (action === 'accept') {
        toast.success('Connection accepted');
      } else {
        toast.success('Connection request declined');
      }
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['connectionStatus', currentOrg?.id, otherOrgId] });
      queryClient.invalidateQueries({ queryKey: ['pending-connections-count', currentOrg?.id] });
      if (otherOrgId) {
        queryClient.invalidateQueries({ queryKey: ['pending-connections-count', otherOrgId] });
        queryClient.invalidateQueries({ queryKey: ['connected-count', otherOrgId] });
      }
      queryClient.invalidateQueries({ queryKey: ['connected-count', currentOrg?.id] });
      queryClient.invalidateQueries({ queryKey: ['connected-orgs', currentOrg?.id] });
      if (otherOrgId) {
        queryClient.invalidateQueries({ queryKey: ['connected-orgs', otherOrgId] });
      }
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to respond to connection request');
    },
  });

  // Handle Connect button click
  const handleConnectClick = () => {
    if (!currentOrg) {
      toast.error('Switch to an org to connect');
      return;
    }

    if (connectionState === 'none') {
      requestConnectionMutation.mutate();
    } else if (connectionState === 'incoming_pending') {
      respondToConnectionMutation.mutate('accept');
    } else if (connectionState === 'accepted' && currentOrg) {
      // Navigate to MY org's connections page when Connected (privacy-safe)
      navigate(`/app/org/${currentOrg.id}/connections`);
    }
  };

  // Handle reject click
  const handleRejectClick = () => {
    if (connectionState === 'incoming_pending') {
      respondToConnectionMutation.mutate('reject');
    }
  };

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

  // Hide Connect button if viewing own org
  if (currentOrg && otherOrgId && currentOrg.id === otherOrgId) {
    return (
      <div className="flex gap-3 mb-6">
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

  // Determine button label and state
  const getButtonLabel = (): string => {
    if (isLoadingStatus) return 'Loading...';
    switch (connectionState) {
      case 'outgoing_pending':
        return 'Requested';
      case 'incoming_pending':
        return 'Confirm';
      case 'accepted':
        return 'Connected';
      case 'blocked':
        return 'Blocked';
      default:
        return 'Connect';
    }
  };

  const isButtonDisabled = 
    !currentOrg ||
    isLoadingStatus ||
    connectionState === 'outgoing_pending' ||
    connectionState === 'blocked' ||
    requestConnectionMutation.isPending ||
    respondToConnectionMutation.isPending;
  
  // Connected button should be clickable (not disabled)
  const isConnectedButton = connectionState === 'accepted';

  const isProcessing = requestConnectionMutation.isPending || respondToConnectionMutation.isPending;

  // Public mode: Connect and Message buttons
  return (
    <div className="flex gap-3 mb-6">
      {connectionState === 'incoming_pending' ? (
        // Show Confirm and Delete buttons for incoming pending
        <>
          <Button
            onClick={handleConnectClick}
            disabled={isButtonDisabled}
            className="flex-1 h-12 rounded-2xl font-bold"
            style={{ backgroundColor: '#0E7A3A', color: 'white' }}
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            {getButtonLabel()}
          </Button>
          <Button
            onClick={handleRejectClick}
            disabled={isProcessing}
            variant="outline"
            className="h-12 w-12 rounded-2xl"
            style={{ borderColor: 'rgba(14,122,58,0.2)' }}
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <X className="h-4 w-4" />
            )}
          </Button>
        </>
      ) : (
        // Show Connect button (or Requested/Connected/Blocked)
        <Button
          onClick={handleConnectClick}
          disabled={isConnectedButton ? false : isButtonDisabled}
          variant={connectionState === 'accepted' ? 'outline' : 'default'}
          className="flex-1 h-12 rounded-2xl font-bold"
          style={{
            backgroundColor: connectionState === 'outgoing_pending' || connectionState === 'accepted' || connectionState === 'blocked'
              ? 'rgba(15,31,23,0.1)'
              : '#0E7A3A',
            color: connectionState === 'outgoing_pending' || connectionState === 'accepted' || connectionState === 'blocked'
              ? 'rgba(15,31,23,0.6)'
              : 'white',
            borderColor: connectionState === 'accepted' ? 'rgba(14,122,58,0.2)' : undefined,
          }}
        >
          {isProcessing ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : connectionState === 'none' ? (
            <UserPlus className="h-4 w-4 mr-2" />
          ) : null}
          {getButtonLabel()}
        </Button>
      )}
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

