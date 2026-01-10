import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook to fetch and poll unread enquiries count
 * Polls every 30 seconds and refetches on window focus
 */
export function useUnreadEnquiriesCount() {
  const { currentOrg } = useAuth();
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const fetchCount = useCallback(async () => {
    if (!currentOrg?.id) {
      setCount(0);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.rpc('get_unread_enquiries_count', {
        p_org_id: currentOrg.id,
      });

      if (error) {
        console.error('Error fetching unread count:', error);
        setCount(0);
      } else {
        setCount(data || 0);
      }
    } catch (error) {
      console.error('Error fetching unread count:', error);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, [currentOrg?.id]);

  useEffect(() => {
    if (!currentOrg?.id) {
      setCount(0);
      setLoading(false);
      return;
    }

    // Initial fetch
    fetchCount();

    // Poll every 30 seconds
    const interval = setInterval(() => {
      fetchCount();
    }, 30000);

    // Refetch on window focus
    const handleFocus = () => {
      fetchCount();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [currentOrg?.id, fetchCount]);

  return { count, loading, refetch: fetchCount };
}

