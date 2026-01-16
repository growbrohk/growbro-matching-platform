import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { usePendingConnectionsCount, type PendingConnection } from '@/hooks/use-pending-connections-count';
import { Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

interface SuggestedOrg {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
}

export default function ConnectRequestsPage() {
  const navigate = useNavigate();
  const { currentOrg } = useAuth();
  const { data: pendingData, refetch: refetchPending } = usePendingConnectionsCount();
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [dismissedSuggestedIds, setDismissedSuggestedIds] = useState<Set<string>>(new Set());
  // Track which orgs we've sent requests to
  const [requestedOrgIds, setRequestedOrgIds] = useState<Set<string>>(new Set());

  // Track orgs we've sent pending requests to
  useEffect(() => {
    if (!currentOrg) return;

    const fetchPendingRequests = async () => {
      const { data: existingConnections } = await supabase
        .from('connections')
        .select('org_a_id, org_b_id, status, requested_by_org_id')
        .or(`org_a_id.eq.${currentOrg.id},org_b_id.eq.${currentOrg.id}`)
        .eq('status', 'pending')
        .eq('requested_by_org_id', currentOrg.id);

      if (existingConnections) {
        const pendingRequestedOrgIds = new Set<string>();
        existingConnections.forEach((conn) => {
          const otherOrgId = conn.org_a_id === currentOrg.id ? conn.org_b_id : conn.org_a_id;
          pendingRequestedOrgIds.add(otherOrgId);
        });
        setRequestedOrgIds(pendingRequestedOrgIds);
      }
    };

    fetchPendingRequests();
  }, [currentOrg]);

  // Fetch suggested orgs (random orgs excluding current org and existing connections)
  const { data: suggestedOrgs, isLoading: loadingSuggested, refetch: refetchSuggested } = useQuery({
    queryKey: ['suggested-orgs', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];

      // Get all org IDs that current org has connections with (any status)
      const { data: existingConnections } = await supabase
        .from('connections')
        .select('org_a_id, org_b_id, status, requested_by_org_id')
        .or(`org_a_id.eq.${currentOrg.id},org_b_id.eq.${currentOrg.id}`);

      const connectedOrgIds = new Set<string>();
      
      if (existingConnections) {
        existingConnections.forEach((conn) => {
          const otherOrgId = conn.org_a_id === currentOrg.id ? conn.org_b_id : conn.org_a_id;
          connectedOrgIds.add(otherOrgId);
        });
      }

      // Fetch random orgs excluding current org and connected orgs
      const { data: allOrgs } = await supabase
        .from('orgs')
        .select('id, name, slug')
        .neq('id', currentOrg.id)
        .limit(100); // Get a larger pool to randomize from

      if (!allOrgs) return [];

      // Filter out connected orgs and randomize
      const availableOrgs = allOrgs
        .filter((org) => !connectedOrgIds.has(org.id))
        .sort(() => Math.random() - 0.5)
        .slice(0, 10);

      // Fetch org profiles for logo_url
      const orgIds = availableOrgs.map((o) => o.id);
      if (orgIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from('org_profiles')
        .select('org_id, logo_url')
        .in('org_id', orgIds);

      const profileMap = new Map<string, string | null>();
      if (profiles) {
        profiles.forEach((p) => {
          profileMap.set(p.org_id, p.logo_url);
        });
      }

      return availableOrgs.map((org) => ({
        id: org.id,
        name: org.name,
        slug: org.slug,
        logo_url: profileMap.get(org.id) || null,
      })) as SuggestedOrg[];
    },
    enabled: !!currentOrg,
  });

  const handleConfirm = async (connectionId: string) => {
    if (!currentOrg || processingIds.has(connectionId)) return;

    setProcessingIds((prev) => new Set(prev).add(connectionId));

    try {
      const { error } = await supabase.rpc('respond_to_connection', {
        p_connection_id: connectionId,
        p_action: 'accept',
      });

      if (error) {
        console.error('Error accepting connection:', error);
        alert('Failed to accept connection. Please try again.');
        return;
      }

      // Optimistically remove from list
      await refetchPending();
    } catch (error) {
      console.error('Error accepting connection:', error);
      alert('Failed to accept connection. Please try again.');
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(connectionId);
        return next;
      });
    }
  };

  const handleDelete = async (connectionId: string) => {
    if (!currentOrg || processingIds.has(connectionId)) return;

    setProcessingIds((prev) => new Set(prev).add(connectionId));

    try {
      const { error } = await supabase.rpc('respond_to_connection', {
        p_connection_id: connectionId,
        p_action: 'reject',
      });

      if (error) {
        console.error('Error rejecting connection:', error);
        alert('Failed to reject connection. Please try again.');
        return;
      }

      // Optimistically remove from list
      await refetchPending();
    } catch (error) {
      console.error('Error rejecting connection:', error);
      alert('Failed to reject connection. Please try again.');
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(connectionId);
        return next;
      });
    }
  };

  const handleConnect = async (targetOrgId: string) => {
    if (!currentOrg || processingIds.has(targetOrgId)) return;

    setProcessingIds((prev) => new Set(prev).add(targetOrgId));

    try {
      const { error } = await supabase.rpc('request_connection', {
        p_requester_org_id: currentOrg.id,
        p_target_org_id: targetOrgId,
      });

      if (error) {
        console.error('Error requesting connection:', error);
        // Check if it's an "already requested" or "already connected" error
        if (error.message.includes('already') || error.message.includes('pending') || error.message.includes('connected')) {
          // Mark as requested in UI
          setRequestedOrgIds((prev) => new Set(prev).add(targetOrgId));
        } else {
          alert('Failed to send connection request. Please try again.');
        }
        return;
      }

      // Mark as requested
      setRequestedOrgIds((prev) => new Set(prev).add(targetOrgId));
      
      // Refetch suggested to update UI (will exclude this org now)
      await refetchSuggested();
    } catch (error: any) {
      console.error('Error requesting connection:', error);
      if (error.message?.includes('already') || error.message?.includes('pending') || error.message?.includes('connected')) {
        // Already requested, mark in UI
        setRequestedOrgIds((prev) => new Set(prev).add(targetOrgId));
      } else {
        alert('Failed to send connection request. Please try again.');
      }
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(targetOrgId);
        return next;
      });
    }
  };

  const handleDismissSuggested = (orgId: string) => {
    setDismissedSuggestedIds((prev) => new Set(prev).add(orgId));
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const pendingConnections = pendingData?.connections || [];
  const filteredSuggested = (suggestedOrgs || []).filter(
    (org) => !dismissedSuggestedIds.has(org.id)
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/app/enquiries')}
          className="h-10 w-10 rounded-full"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
          Connect requests
        </h1>
      </div>

      {/* Follow Requests Section */}
      {pendingConnections.length > 0 && (
        <div className="space-y-4">
          {pendingConnections.map((connection) => {
            const isProcessing = processingIds.has(connection.connection_id);
            const orgName = connection.other_org_name;
            const orgHandle = connection.other_org_slug || connection.other_org_id.slice(0, 8);
            const logoUrl = connection.other_org_logo_url;

            return (
              <Card
                key={connection.connection_id}
                className="rounded-2xl border p-4"
                style={{ borderColor: 'rgba(14,122,58,0.14)' }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Avatar className="h-12 w-12 flex-shrink-0">
                      {logoUrl ? (
                        <AvatarImage src={logoUrl} alt={orgName} />
                      ) : null}
                      <AvatarFallback className="bg-muted text-muted-foreground">
                        {getInitials(orgName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm" style={{ color: '#0F1F17' }}>
                        {orgName}
                      </div>
                      <div className="text-xs" style={{ color: 'rgba(15,31,23,0.6)' }}>
                        {orgHandle}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      onClick={() => handleConfirm(connection.connection_id)}
                      disabled={isProcessing}
                      className="h-9 px-4 rounded-lg"
                      style={{ backgroundColor: '#0E7A3A', color: 'white' }}
                    >
                      {isProcessing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Confirm'
                      )}
                    </Button>
                    <Button
                      onClick={() => handleDelete(connection.connection_id)}
                      disabled={isProcessing}
                      variant="outline"
                      className="h-9 px-4 rounded-lg"
                      style={{ borderColor: 'rgba(14,122,58,0.2)' }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {pendingConnections.length === 0 && (
        <Card className="rounded-2xl border p-8 text-center" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
          <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
            No pending connection requests
          </p>
        </Card>
      )}

      {/* Suggested for you Section */}
      {filteredSuggested.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold" style={{ color: '#0F1F17' }}>
            Suggested for you
          </h2>
          {filteredSuggested.map((org) => {
            const isProcessing = processingIds.has(org.id);
            const isRequested = requestedOrgIds.has(org.id);
            const orgHandle = org.slug || org.id.slice(0, 8);
            const logoUrl = org.logo_url;

            return (
              <Card
                key={org.id}
                className="rounded-2xl border p-4"
                style={{ borderColor: 'rgba(14,122,58,0.14)' }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Avatar className="h-12 w-12 flex-shrink-0">
                      {logoUrl ? (
                        <AvatarImage src={logoUrl} alt={org.name} />
                      ) : null}
                      <AvatarFallback className="bg-muted text-muted-foreground">
                        {getInitials(org.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm" style={{ color: '#0F1F17' }}>
                        {org.name}
                      </div>
                      <div className="text-xs" style={{ color: 'rgba(15,31,23,0.6)' }}>
                        {orgHandle}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      onClick={() => handleConnect(org.id)}
                      disabled={isProcessing || isRequested}
                      className="h-9 px-4 rounded-lg"
                      style={{ 
                        backgroundColor: isRequested ? 'rgba(15,31,23,0.1)' : '#0E7A3A', 
                        color: isRequested ? 'rgba(15,31,23,0.6)' : 'white' 
                      }}
                    >
                      {isProcessing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : isRequested ? (
                        'Requested'
                      ) : (
                        'Connect'
                      )}
                    </Button>
                    <Button
                      onClick={() => handleDismissSuggested(org.id)}
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-full"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {loadingSuggested && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: '#0E7A3A' }} />
        </div>
      )}
    </div>
  );
}
