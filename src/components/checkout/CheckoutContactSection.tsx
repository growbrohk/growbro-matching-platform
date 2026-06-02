import { ContactInfoCard } from '@/components/booking/ContactInfoCard';
import type { ContactInfo } from '@/lib/types/booking';

const BRAND_DARK = '#0F1F17';

export interface CheckoutContactSectionProps {
  contactInfo: ContactInfo;
  onUpdate: (info: ContactInfo) => void;
  requiredFields?: {
    firstName?: boolean;
    lastName?: boolean;
    email?: boolean;
    phone?: boolean;
  };
  description?: string;
  showSectionHeader?: boolean;
}

export function CheckoutContactSection({
  contactInfo,
  onUpdate,
  requiredFields = { firstName: true, lastName: true, email: true, phone: true },
  description = "We'll use this for order updates and delivery",
  showSectionHeader = true,
}: CheckoutContactSectionProps) {
  return (
    <div className="mb-6">
      {showSectionHeader && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-6 rounded" style={{ backgroundColor: '#0E7A3A' }} />
            <h3
              className="text-base font-semibold"
              style={{ color: BRAND_DARK, fontFamily: "'Inter Tight', sans-serif" }}
            >
              Contact info
            </h3>
          </div>
          <p className="text-sm mb-4" style={{ color: 'rgba(15,31,23,0.72)' }}>
            {description}
          </p>
        </>
      )}
      <ContactInfoCard
        contactInfo={contactInfo}
        onUpdate={onUpdate}
        title="Contact info"
        description="Required for order confirmation"
        showPhone={true}
        requiredFields={requiredFields}
        alwaysExpanded
      />
    </div>
  );
}
