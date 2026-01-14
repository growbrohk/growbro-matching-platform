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
 * Uses 'payment-receipts' bucket
 */
async function uploadReceipt(orderId: string, file: File): Promise<string> {
  const fileExt = file.name.split('.').pop();
  const fileName = `${orderId}/${Date.now()}.${fileExt}`;

  const bucketName = 'payment-receipts';

  console.log('[submitManualPayment] Uploading receipt:', {
    bucketName,
    fileName,
    orderId,
    fileSize: file.size,
    fileType: file.type,
  });

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(fileName, file, {
      upsert: false,
      contentType: file.type,
    });

  if (uploadError) {
    console.error('[submitManualPayment] Storage upload error:', {
      error: uploadError,
      message: uploadError.message,
      statusCode: uploadError.statusCode,
      errorCode: uploadError.error,
      bucketName,
      fileName,
      orderId,
    });
    throw new Error(uploadError.message || 'Failed to upload receipt. Please check your connection and try again.');
  }

  console.log('[submitManualPayment] Receipt uploaded successfully:', {
    path: uploadData?.path,
    fileName,
  });

  // For private buckets, we store the path (not a public URL)
  // The path can be used to generate signed URLs when needed
  // Store the full path: payment-receipts/{orderId}/{timestamp}.{ext}
  const receiptPath = `${bucketName}/${fileName}`;
  
  return receiptPath;
}

/**
 * Submit manual payment with receipt
 * Sets payment_status='paid', paid_at=now(), receipt_url, payment_method
 * Keeps fulfillment_status='pending_confirmation'
 */
export async function submitManualPayment({
  orderId,
  paymentMethod,
  receiptFile,
  paymentReferenceLink,
}: SubmitManualPaymentParams): Promise<void> {
  console.log('[submitManualPayment] Starting payment submission:', {
    orderId,
    paymentMethod,
    receiptFileName: receiptFile.name,
    paymentReferenceLink,
  });

  try {
    // Upload receipt
    const receiptUrl = await uploadReceipt(orderId, receiptFile);
    console.log('[submitManualPayment] Receipt uploaded, updating order:', {
      orderId,
      receiptUrl,
    });

    // Update order payment information
    // This now sets payment_status='paid', paid_at=now(), receipt_url, payment_method
    // Keeps fulfillment_status='pending_confirmation'
    await updateOrderPayment(orderId, paymentMethod, receiptUrl, paymentReferenceLink);
    
    console.log('[submitManualPayment] Order updated successfully:', {
      orderId,
      paymentMethod,
    });
  } catch (error: any) {
    console.error('[submitManualPayment] Error during payment submission:', {
      orderId,
      error,
      message: error?.message,
      stack: error?.stack,
    });
    throw error;
  }
}

