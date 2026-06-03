import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Upload } from 'lucide-react';
import type { OrgProfileCategory } from '@/hooks/use-org-profile-form';

const cardStyle = {
  borderColor: 'rgba(14,122,58,0.14)',
  backgroundColor: 'rgba(251,248,244,0.9)',
} as const;

const labelStyle = { color: '#0F1F17' };
const inputStyle = { backgroundColor: '#FBF8F4', color: '#0F1F17' };

export interface OrgProfileFormSectionsProps {
  name: string;
  onNameChange: (value: string) => void;
  instagram: string;
  onInstagramChange: (value: string) => void;
  category: OrgProfileCategory | '';
  onCategoryChange: (value: OrgProfileCategory) => void;
  address: string;
  onAddressChange: (value: string) => void;
  logoUrl: string;
  onLogoUrlChange: (value: string) => void;
  uploadingLogo: boolean;
  logoRenderNonce: number;
  logoFileInputRef: React.RefObject<HTMLInputElement | null>;
  onLogoFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  orgId?: string;
  idPrefix?: string;
}

export default function OrgProfileFormSections({
  name,
  onNameChange,
  instagram,
  onInstagramChange,
  category,
  onCategoryChange,
  address,
  onAddressChange,
  logoUrl,
  onLogoUrlChange,
  uploadingLogo,
  logoRenderNonce,
  logoFileInputRef,
  onLogoFileChange,
  orgId,
  idPrefix = '',
}: OrgProfileFormSectionsProps) {
  const pid = (id: string) => (idPrefix ? `${idPrefix}-${id}` : id);

  return (
    <>
      <Card className="rounded-3xl border shadow-xl" style={cardStyle}>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-lg" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
            Basic info
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0 space-y-4">
          <div className="space-y-2">
            <Label htmlFor={pid('name')} style={labelStyle}>
              Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id={pid('name')}
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Your brand or venue name"
              className="h-10"
              style={inputStyle}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={pid('instagram')} style={labelStyle}>
              Instagram <span className="text-xs text-gray-500">(optional)</span>
            </Label>
            <Input
              id={pid('instagram')}
              value={instagram}
              onChange={(e) => onInstagramChange(e.target.value)}
              placeholder="@handle or URL"
              className="h-10"
              style={inputStyle}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={pid('category')} style={labelStyle}>
              Category <span className="text-red-500">*</span>
            </Label>
            <Select value={category} onValueChange={(val) => onCategoryChange(val as OrgProfileCategory)}>
              <SelectTrigger className="h-10" style={inputStyle}>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="f&b">F&B</SelectItem>
                <SelectItem value="retail">Retail</SelectItem>
                <SelectItem value="service">Service</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor={pid('address')} style={labelStyle}>
              Exact address <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id={pid('address')}
              value={address}
              onChange={(e) => onAddressChange(e.target.value)}
              placeholder="Street address, building name, unit number..."
              className="min-h-[80px]"
              style={inputStyle}
            />
            <p className="text-xs" style={{ color: 'rgba(15,31,23,0.6)' }}>
              Please type your actual address (street / building name).
            </p>
          </div>

          <div className="space-y-2">
            <Label style={labelStyle}>
              Logo <span className="text-xs text-gray-500">(optional)</span>
            </Label>
            <input
              ref={logoFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              id={pid('logo-upload')}
              onChange={onLogoFileChange}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-10"
                style={{ borderColor: 'rgba(14,122,58,0.25)', color: '#0F1F17' }}
                disabled={uploadingLogo || !orgId}
                onClick={() => logoFileInputRef.current?.click()}
              >
                {uploadingLogo ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Upload photo
              </Button>
              {logoUrl ? (
                <img
                  key={logoRenderNonce}
                  src={logoUrl}
                  alt=""
                  className="h-10 w-10 rounded-lg border object-cover"
                  style={{ borderColor: 'rgba(14,122,58,0.14)' }}
                />
              ) : null}
            </div>
            <Label htmlFor={pid('logoUrl')} className="text-xs font-normal" style={{ color: 'rgba(15,31,23,0.72)' }}>
              Or paste image URL
            </Label>
            <Input
              id={pid('logoUrl')}
              value={logoUrl}
              onChange={(e) => onLogoUrlChange(e.target.value)}
              placeholder="https://example.com/logo.png"
              className="h-10"
              style={inputStyle}
            />
          </div>
        </CardContent>
      </Card>
    </>
  );
}
