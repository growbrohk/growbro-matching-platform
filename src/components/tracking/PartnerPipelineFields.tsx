import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { OrgSearchCombobox } from './OrgSearchCombobox';

export type PartnerPipelineType = 'affiliate' | 'collab';
export type CommissionBasis = 'revenue' | 'profit';
export type CollabSalesScope = 'attributed' | 'all_for_resource';
export type CollabPartnerRole = 'viewer' | 'editor';

export interface PartnerPipelineValues {
  pipelineType: PartnerPipelineType;
  affiliateOrgId?: string;
  startDate: string;
  endDate: string;
  commissionRate: string;
  commissionBasis: CommissionBasis;
  collabSalesScope: CollabSalesScope;
  collabPartnerRole: CollabPartnerRole;
  collabCanViewDetails: boolean;
  collabCanMarkShipped: boolean;
  collabShowOnPartnerPublicProfile: boolean;
  collabShowInPartnerEventsTab: boolean;
  collabAllowEditTab: boolean;
  collabAllowTicketsTab: boolean;
  collabAllowScanTab: boolean;
}

export const defaultPartnerPipelineValues = (): PartnerPipelineValues => ({
  pipelineType: 'collab',
  affiliateOrgId: undefined,
  startDate: '',
  endDate: '',
  commissionRate: '',
  commissionBasis: 'revenue',
  collabSalesScope: 'attributed',
  collabPartnerRole: 'viewer',
  collabCanViewDetails: false,
  collabCanMarkShipped: false,
  collabShowOnPartnerPublicProfile: true,
  collabShowInPartnerEventsTab: true,
  collabAllowEditTab: false,
  collabAllowTicketsTab: true,
  collabAllowScanTab: true,
});

export function buildCollabColumnsForTrackingLink(
  values: PartnerPipelineValues,
  opts: { destinationType: 'event' | 'product' | 'custom'; hasEvent: boolean; hasProduct: boolean }
): Record<string, unknown> {
  if (values.pipelineType !== 'collab') {
    return {
      collab_sales_scope: null,
      collab_partner_role: null,
      collab_can_view_order_details: null,
      collab_can_mark_shipped: null,
      collab_show_event_in_partner_events_tab: null,
      collab_partner_allow_edit_tab: null,
      collab_partner_allow_tickets_tab: null,
      collab_partner_allow_scan_tab: null,
      collab_show_on_partner_public_profile: null,
    };
  }

  const isEventCollab = opts.destinationType === 'event' && opts.hasEvent;
  const hasResource =
    (opts.destinationType === 'event' && opts.hasEvent) ||
    (opts.destinationType === 'product' && opts.hasProduct);

  return {
    collab_sales_scope: values.collabSalesScope,
    collab_partner_role: values.collabPartnerRole,
    collab_can_view_order_details: values.collabCanViewDetails,
    collab_can_mark_shipped: values.collabCanMarkShipped,
    collab_show_event_in_partner_events_tab: isEventCollab ? values.collabShowInPartnerEventsTab : true,
    collab_partner_allow_edit_tab: isEventCollab ? values.collabAllowEditTab : false,
    collab_partner_allow_tickets_tab: isEventCollab ? values.collabAllowTicketsTab : true,
    collab_partner_allow_scan_tab: isEventCollab ? values.collabAllowScanTab : true,
    collab_show_on_partner_public_profile: hasResource ? values.collabShowOnPartnerPublicProfile : false,
  };
}

interface PartnerPipelineFieldsProps {
  values: PartnerPipelineValues;
  onChange: (patch: Partial<PartnerPipelineValues>) => void;
  excludeOrgId?: string;
  /** When true, show pipeline type selector (affiliate vs collab). */
  showPipelineTypeSelect?: boolean;
  destinationType?: 'event' | 'product' | 'custom';
  selectedEventId?: string;
  selectedProductId?: string;
  idPrefix?: string;
}

export function PartnerPipelineFields({
  values,
  onChange,
  excludeOrgId,
  showPipelineTypeSelect = true,
  destinationType = 'product',
  selectedEventId = '',
  selectedProductId = '',
  idPrefix = '',
}: PartnerPipelineFieldsProps) {
  const pid = idPrefix ? `${idPrefix}-` : '';
  const showCollabPanel = values.pipelineType === 'collab';
  const showProductPublic =
    destinationType === 'product' && !!selectedProductId;
  const showEventDashboard = destinationType === 'event' && !!selectedEventId;

  return (
    <div className="space-y-4">
      {showPipelineTypeSelect && (
        <div className="space-y-2">
          <Label htmlFor={`${pid}pipeline-type`}>Partner type</Label>
          <Select
            value={values.pipelineType}
            onValueChange={(v) => onChange({ pipelineType: v as PartnerPipelineType })}
          >
            <SelectTrigger id={`${pid}pipeline-type`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="affiliate">Affiliate</SelectItem>
              <SelectItem value="collab">Collab</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor={`${pid}affiliate`}>Affiliate Partner</Label>
        <OrgSearchCombobox
          value={values.affiliateOrgId}
          onValueChange={(id) => onChange({ affiliateOrgId: id })}
          placeholder="Search organizations..."
          excludeOrgId={excludeOrgId}
        />
      </div>

      <div className="space-y-2">
        <Label>Partner period</Label>
        <div className="grid grid-cols-2 gap-2 min-w-0">
          <div className="space-y-1 min-w-0">
            <Label htmlFor={`${pid}start-date`} className="text-xs text-muted-foreground">
              Start Date
            </Label>
            <Input
              id={`${pid}start-date`}
              type="date"
              value={values.startDate}
              onChange={(e) => onChange({ startDate: e.target.value })}
              className="w-full min-w-0 text-sm"
            />
          </div>
          <div className="space-y-1 min-w-0">
            <Label htmlFor={`${pid}end-date`} className="text-xs text-muted-foreground">
              End Date
            </Label>
            <Input
              id={`${pid}end-date`}
              type="date"
              value={values.endDate}
              onChange={(e) => onChange({ endDate: e.target.value })}
              className="w-full min-w-0 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${pid}commission-rate`}>Commission Rate (%)</Label>
        <Input
          id={`${pid}commission-rate`}
          type="number"
          min="0"
          max="100"
          step="0.1"
          value={values.commissionRate}
          onChange={(e) => onChange({ commissionRate: e.target.value })}
          placeholder="e.g., 15"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${pid}commission-basis`}>Commission basis</Label>
        <Select
          value={values.commissionBasis}
          onValueChange={(v) => onChange({ commissionBasis: v as CommissionBasis })}
        >
          <SelectTrigger id={`${pid}commission-basis`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="revenue">Revenue (order total)</SelectItem>
            <SelectItem value="profit">Profit (after cost, shipping & payment fee)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Profit uses the product&apos;s unit cost and shipping fee on each order. Stripe payment
          processing fees (3.4% + $2.35) are also deducted when the order was paid via Stripe. Cost
          is set on the product form.
        </p>
      </div>

      {showCollabPanel && (
        <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Partner visibility
          </p>
          <div className="space-y-2">
            <Label htmlFor={`${pid}collab-scope`}>Sales visibility</Label>
            <Select
              value={values.collabSalesScope}
              onValueChange={(v) => onChange({ collabSalesScope: v as CollabSalesScope })}
            >
              <SelectTrigger id={`${pid}collab-scope`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="attributed">Orders through this link only</SelectItem>
                <SelectItem value="all_for_resource">All sales for this product or event</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${pid}collab-role`}>Partner role</Label>
            <Select
              value={values.collabPartnerRole}
              onValueChange={(v) => onChange({ collabPartnerRole: v as CollabPartnerRole })}
            >
              <SelectTrigger id={`${pid}collab-role`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer (read-only)</SelectItem>
                <SelectItem value="editor">Editor (can confirm orders)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={`${pid}collab-details`} className="text-sm font-normal">
              Allow order detail page
            </Label>
            <input
              id={`${pid}collab-details`}
              type="checkbox"
              className="h-4 w-4 accent-gray-800"
              checked={values.collabCanViewDetails}
              onChange={(e) => onChange({ collabCanViewDetails: e.target.checked })}
            />
          </div>
          <div className="flex items-start justify-between gap-2">
            <Label htmlFor={`${pid}collab-shipped`} className="text-sm font-normal leading-snug">
              Allow partner to mark sent and tracking (after payment is confirmed)
            </Label>
            <input
              id={`${pid}collab-shipped`}
              type="checkbox"
              className="h-4 w-4 accent-gray-800 mt-0.5 shrink-0"
              checked={values.collabCanMarkShipped}
              onChange={(e) => onChange({ collabCanMarkShipped: e.target.checked })}
              disabled={values.collabPartnerRole !== 'editor'}
            />
          </div>
          {values.collabPartnerRole !== 'editor' ? (
            <p className="text-xs text-muted-foreground">Editors only — set role to Editor to enable.</p>
          ) : null}

          {showProductPublic && (
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/60">
              <Label
                htmlFor={`${pid}collab-show-partner-public`}
                className="text-sm font-normal leading-snug"
              >
                Show on partner&apos;s public brand page
              </Label>
              <input
                id={`${pid}collab-show-partner-public`}
                type="checkbox"
                className="h-4 w-4 accent-gray-800 shrink-0"
                checked={values.collabShowOnPartnerPublicProfile}
                onChange={(e) => onChange({ collabShowOnPartnerPublicProfile: e.target.checked })}
              />
            </div>
          )}

          {showEventDashboard && (
            <div className="space-y-3 pt-2 border-t border-border/60">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Partner dashboard (this event)
              </p>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor={`${pid}collab-show-events-tab`} className="text-sm font-normal leading-snug">
                  Show event in partner&apos;s Events tab
                </Label>
                <input
                  id={`${pid}collab-show-events-tab`}
                  type="checkbox"
                  className="h-4 w-4 accent-gray-800 shrink-0"
                  checked={values.collabShowInPartnerEventsTab}
                  onChange={(e) => onChange({ collabShowInPartnerEventsTab: e.target.checked })}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor={`${pid}collab-allow-tickets`} className="text-sm font-normal leading-snug">
                  Allow Tickets tab (guest list)
                </Label>
                <input
                  id={`${pid}collab-allow-tickets`}
                  type="checkbox"
                  className="h-4 w-4 accent-gray-800 shrink-0"
                  checked={values.collabAllowTicketsTab}
                  onChange={(e) => onChange({ collabAllowTicketsTab: e.target.checked })}
                />
              </div>
              <div className="flex items-start justify-between gap-2">
                <Label htmlFor={`${pid}collab-allow-scan`} className="text-sm font-normal leading-snug">
                  Allow Scan tab (check-in). Requires partner role Editor.
                </Label>
                <input
                  id={`${pid}collab-allow-scan`}
                  type="checkbox"
                  className="h-4 w-4 accent-gray-800 mt-0.5 shrink-0"
                  checked={values.collabAllowScanTab}
                  onChange={(e) => onChange({ collabAllowScanTab: e.target.checked })}
                  disabled={values.collabPartnerRole !== 'editor'}
                />
              </div>
              <div className="flex items-start justify-between gap-2">
                <Label htmlFor={`${pid}collab-allow-edit`} className="text-sm font-normal leading-snug">
                  Allow Edit tab (event &amp; ticket setup). Requires partner role Editor.
                </Label>
                <input
                  id={`${pid}collab-allow-edit`}
                  type="checkbox"
                  className="h-4 w-4 accent-gray-800 mt-0.5 shrink-0"
                  checked={values.collabAllowEditTab}
                  onChange={(e) => onChange({ collabAllowEditTab: e.target.checked })}
                  disabled={values.collabPartnerRole !== 'editor'}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
