import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { PartnerPipelineFields } from '@/components/tracking/PartnerPipelineFields';
import {
  createEmptyEventPartnerDraft,
  loadEventPartners,
  type EventPartnerDraft,
} from '@/lib/api/event-partners';

export interface EventCollabSectionProps {
  eventId: string | undefined;
  hostOrgId: string | undefined;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  partners: EventPartnerDraft[];
  onPartnersChange: (partners: EventPartnerDraft[]) => void;
  reloadToken?: number;
  onHydrated?: () => void;
}

export function EventCollabSection({
  eventId,
  hostOrgId,
  enabled,
  onEnabledChange,
  partners,
  onPartnersChange,
  reloadToken = 0,
  onHydrated,
}: EventCollabSectionProps) {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!eventId || !hostOrgId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const loaded = await loadEventPartners(eventId, hostOrgId);
        if (cancelled) return;
        if (loaded.length > 0) {
          onEnabledChange(true);
          onPartnersChange(loaded);
        }
        onHydrated?.();
      } catch (e) {
        console.error('loadEventPartners', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, hostOrgId, reloadToken]);

  const updatePartner = (localId: string, patch: Partial<EventPartnerDraft>) => {
    onPartnersChange(
      partners.map((p) => (p.localId === localId ? { ...p, ...patch } : p))
    );
  };

  const updatePartnerValues = (localId: string, patch: Partial<EventPartnerDraft['partner']>) => {
    onPartnersChange(
      partners.map((p) =>
        p.localId === localId ? { ...p, partner: { ...p.partner, ...patch } } : p
      )
    );
  };

  const activePartners = partners.filter((p) => !p.deleted);

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Partner collab / affiliate</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage pipeline partners for this event (same as Pipeline page).
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={onEnabledChange} />
      </div>

      {enabled && (
        <div className="space-y-4">
          {loading && (
            <p className="text-xs text-muted-foreground">Loading existing partners…</p>
          )}

          {activePartners.map((draft, index) => (
            <div key={draft.localId} className="rounded-lg border p-3 space-y-3 bg-muted/20">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  Partner {index + 1}
                  {draft.affiliateOrgName ? ` — ${draft.affiliateOrgName}` : ''}
                </span>
                <div className="flex items-center gap-2">
                  <Select
                    value={draft.status}
                    onValueChange={(v) =>
                      updatePartner(draft.localId, {
                        status: v as EventPartnerDraft['status'],
                      })
                    }
                  >
                    <SelectTrigger className="h-8 w-[110px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    aria-label="Remove partner"
                    onClick={() => {
                      if (draft.trackingLinkId) {
                        updatePartner(draft.localId, { deleted: true });
                      } else {
                        onPartnersChange(partners.filter((p) => p.localId !== draft.localId));
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <PartnerPipelineFields
                values={draft.partner}
                onChange={(patch) => updatePartnerValues(draft.localId, patch)}
                excludeOrgId={hostOrgId}
                showPipelineTypeSelect
                destinationType="event"
                selectedEventId={eventId}
                idPrefix={draft.localId.slice(0, 8)}
              />
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPartnersChange([...partners, createEmptyEventPartnerDraft()])}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add partner
          </Button>
        </div>
      )}

      {!enabled && <Separator />}
    </div>
  );
}
