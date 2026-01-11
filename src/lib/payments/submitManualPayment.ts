/**
 * Submit manual payment (PayMe/FPS) with receipt upload
 */

import { supabase } from '@/integrations/supabase/client';
import { updateOrderPayment } from '@/lib/api/bookings';

export type ManualPaymentMethod = 'payme' | 'fps';

export interface SubmitManualPaymentParams {
  orderId: string;
  paymentMethod: ManualPaymentMethod;
  receiptFile: File;
  paymentReferenceLink: string;
}

/**
 * Upload receipt file to Supabase Storage
 */
async function uploadReceipt(orderId: string, file: File): Promise<string> {
  const fileExt = file.name.split('.').pop();
  const fileName = `${orderId}/${Date.now()}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from('payment-receipts')
    .upload(fileName, file, {
      upsert: false,
      contentType: file.type,
    });

  if (uploadError) {
    console.error('Error uploading receipt:', uploadError);
    throw new Error(uploadError.message || 'Failed to upload receipt');
  }

  // Get public URL (or signed URL for private buckets)
  // For private buckets, we'd use getPublicUrl but it might not work
  // For now, we'll use getPublicUrl - if bucket is private, we may need signed URLs
  const { data: urlData } = supabase.storage
    .from('payment-receipts')
    .getPublicUrl(fileName);

  return urlData.publicUrl;
}

/**
 * Submit manual payment with receipt
 */
export async function submitManualPayment({
  orderId,
  paymentMethod,
  receiptFile,
  paymentReferenceLink,
}: SubmitManualPaymentParams): Promise<void> {
  // Upload receipt
  const receiptUrl = await uploadReceipt(orderId, receiptFile);

  // Update order payment information
  await updateOrderPayment(orderId, paymentMethod, receiptUrl, paymentReferenceLink);
}

