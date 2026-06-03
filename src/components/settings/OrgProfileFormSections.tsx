import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ImageIcon, Upload } from 'lucide-react';

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
  address: string;
  onAddressChange: (value: string) => void;
  logoUrl: string;
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
  address,
  onAddressChange,
  logoUrl,
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
            <Label style={labelStyle}>
              Logo <span className="text-xs text-gray-500">(optional)</span>
            </Label>
            <div className="flex items-center gap-4">
              {logoUrl ? (
                <img
                  key={logoRenderNonce}
                  src={logoUrl}
                  alt="Logo"
                  className="h-24 w-24 object-contain rounded-lg border"
                />
              ) : (
                <div className="h-24 w-24 rounded-lg border border-dashed flex items-center justify-center bg-muted/50">
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <label className={orgId && !uploadingLogo ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}>
                <input
                  ref={logoFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  id={pid('logo-upload')}
                  disabled={uploadingLogo || !orgId}
                  onChange={onLogoFileChange}
                />
                <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm hover:bg-muted">
                  <Upload className="h-4 w-4" />
                  {uploadingLogo ? 'Uploading...' : 'Upload'}
                </span>
              </label>
            </div>
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
            <Label htmlFor={pid('address')} style={labelStyle}>
              Address <span className="text-xs text-gray-500">(optional)</span>
            </Label>
            <Textarea
              id={pid('address')}
              value={address}
              onChange={(e) => onAddressChange(e.target.value)}
              placeholder="Street address, building name, unit number..."
              className="min-h-[80px]"
              style={inputStyle}
            />
          </div>
        </CardContent>
      </Card>
    </>
  );
}
