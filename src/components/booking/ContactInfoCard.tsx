/**
 * Shared Contact Info Component
 * Used in both FREE route and Per-Ticket mode to ensure consistent UI and validation
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Plus } from 'lucide-react';
import type { ContactInfo } from '@/lib/types/booking';

interface ContactInfoCardProps {
  contactInfo: ContactInfo;
  onUpdate: (info: ContactInfo) => void;
  title?: string;
  description?: string;
  showPhone?: boolean;
  requiredFields?: {
    firstName?: boolean;
    lastName?: boolean;
    email?: boolean;
    phone?: boolean;
  };
}

const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Normalize email: lowercase and trim
const normalizeEmail = (email: string): string => {
  return email.trim().toLowerCase();
};

export function ContactInfoCard({
  contactInfo,
  onUpdate,
  title = 'Contact info',
  description = "We'll contact you only if there's any updates to your booking",
  showPhone = true,
  requiredFields = {
    firstName: true,
    lastName: true,
    email: true,
    phone: true,
  },
}: ContactInfoCardProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [editingInfo, setEditingInfo] = useState<ContactInfo>(contactInfo);

  // Sync editingInfo when contactInfo prop changes (but not when dialog is open)
  useEffect(() => {
    if (!showDialog) {
      setEditingInfo(contactInfo);
    }
  }, [contactInfo, showDialog]);

  const hasContactInfo =
    contactInfo.firstName || contactInfo.lastName || contactInfo.phone || contactInfo.email;

  // Validate editingInfo (draft state), not contactInfo (prop)
  const isEditingValid = (info: ContactInfo): boolean => {
    return (
      (!requiredFields.firstName || info.firstName.trim() !== '') &&
      (!requiredFields.lastName || info.lastName.trim() !== '') &&
      (!requiredFields.email || isValidEmail(info.email)) &&
      (!requiredFields.phone || !showPhone || info.phone.trim() !== '')
    );
  };

  const handleSave = () => {
    // Validate editingInfo, not contactInfo
    if (isEditingValid(editingInfo)) {
      // Normalize email before saving
      const normalizedInfo: ContactInfo = {
        ...editingInfo,
        email: normalizeEmail(editingInfo.email),
      };
      onUpdate(normalizedInfo);
      setShowDialog(false);
    }
  };

  const handleOpenDialog = () => {
    setEditingInfo(contactInfo);
    setShowDialog(true);
  };

  return (
    <>
      {/* Contact Card Display */}
      {hasContactInfo ? (
        <div
          className="border rounded-2xl p-4 space-y-3"
          style={{
            borderColor: 'rgba(14,122,58,0.14)',
            backgroundColor: 'rgba(251,248,244,0.9)',
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex-1 grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">First name</Label>
                <p
                  className="text-sm mt-1"
                  style={{ color: contactInfo.firstName ? '#0F1F17' : '#0E7A3A' }}
                >
                  {contactInfo.firstName || 'Please enter'}
                </p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Last name</Label>
                <p
                  className="text-sm mt-1"
                  style={{ color: contactInfo.lastName ? '#0F1F17' : '#0E7A3A' }}
                >
                  {contactInfo.lastName || 'Please enter'}
                </p>
              </div>
              {showPhone && (
                <div>
                  <Label className="text-xs text-muted-foreground">Phone number</Label>
                  <p
                    className="text-sm mt-1"
                    style={{ color: contactInfo.phone ? '#0F1F17' : '#0E7A3A' }}
                  >
                    {contactInfo.phone || 'Please enter'}
                  </p>
                </div>
              )}
              <div>
                <Label className="text-xs text-muted-foreground">Email address</Label>
                <p
                  className="text-sm mt-1"
                  style={{ color: contactInfo.email ? '#0F1F17' : '#0E7A3A' }}
                >
                  {contactInfo.email || 'Please enter'}
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleOpenDialog}
              className="ml-2"
            >
              Edit
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleOpenDialog}
          style={{ borderColor: 'rgba(14,122,58,0.2)', color: '#0E7A3A' }}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      )}

      {/* Contact Info Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="firstName">
                First name {requiredFields.firstName && <span className="text-red-500">*</span>}
              </Label>
              <Input
                id="firstName"
                type="text"
                value={editingInfo.firstName}
                onChange={(e) =>
                  setEditingInfo({ ...editingInfo, firstName: e.target.value })
                }
                className="mt-1"
                placeholder="Enter first name"
              />
            </div>
            <div>
              <Label htmlFor="lastName">
                Last name {requiredFields.lastName && <span className="text-red-500">*</span>}
              </Label>
              <Input
                id="lastName"
                type="text"
                value={editingInfo.lastName}
                onChange={(e) =>
                  setEditingInfo({ ...editingInfo, lastName: e.target.value })
                }
                className="mt-1"
                placeholder="Enter last name"
              />
            </div>
            {showPhone && (
              <div>
                <Label htmlFor="phone">
                  Phone number{' '}
                  {requiredFields.phone && <span className="text-red-500">*</span>}
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  value={editingInfo.phone}
                  onChange={(e) =>
                    setEditingInfo({ ...editingInfo, phone: e.target.value })
                  }
                  className="mt-1"
                  placeholder="Enter phone number"
                />
              </div>
            )}
            <div>
              <Label htmlFor="email">
                Email address {requiredFields.email && <span className="text-red-500">*</span>}
              </Label>
              <Input
                id="email"
                type="email"
                value={editingInfo.email}
                onChange={(e) =>
                  setEditingInfo({ ...editingInfo, email: e.target.value })
                }
                className="mt-1"
                placeholder="Enter email address"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSave();
              }}
              disabled={!isEditingValid(editingInfo)}
              className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

