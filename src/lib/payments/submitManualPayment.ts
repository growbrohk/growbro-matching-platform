/**
 * Submit manual payment (PayMe/FPS) with receipt upload
 * 
 * SECURITY: Uses submit_payment_receipt RPC which:
 * - Sets payment_status='submitted' (NOT 'paid')
 * - Sets submitted_at, receipt_url, payment_method
 * - Does NOT set paid_at or fulfillment_status='confirmed'
 * - Only host confirmation can mark order as paid
 */

import { supabase } from '@/integrations/supabase/client';

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

  // Store just the object path (without bucket prefix) for consistency
  // Host view will use this path to generate signed URLs
  // Format: {orderId}/{timestamp}.{ext}
  return fileName;
}

/**
 * Submit manual payment with receipt
 * Uses submit_payment_receipt RPC which sets payment_status='submitted'
 * Does NOT mark order as paid - host must confirm via update_order_fulfillment
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
    // Get edit_token from localStorage
    const editToken = localStorage.getItem(`order_edit_token:${orderId}`);
    
    if (!editToken) {
      const errorMsg = "This browser session can't submit receipts. Please use the same device/session you used to create the order.";
      console.error('[submitManualPayment] Edit token missing:', {
        orderId,
        error: errorMsg,
      });
      throw new Error(errorMsg);
    }

    console.log('[submitManualPayment] Edit token found in localStorage:', {
      orderId,
      editTokenPresent: true,
    });

    // Upload receipt
    const receiptUrl = await uploadReceipt(orderId, receiptFile);
    console.log('[submitManualPayment] Receipt uploaded, submitting via RPC:', {
      orderId,
      receiptUrl,
    });

    // Call RPC function to submit payment receipt
    // This sets payment_status='submitted' but does NOT mark as paid
    // Uses edit_token for authorization instead of JWT email
    const { error: rpcError } = await supabase.rpc('submit_payment_receipt', {
      p_order_id: orderId,
      p_edit_token: editToken,
      p_payment_method: paymentMethod,
      p_receipt_url: receiptUrl,
      p_payment_reference_link: paymentReferenceLink || null,
    });

    if (rpcError) {
      console.error('[submitManualPayment] RPC error:', {
        orderId,
        error: rpcError,
        message: rpcError.message,
        code: rpcError.code,
        details: rpcError.details,
        hint: rpcError.hint,
      });
      throw new Error(rpcError.message || 'Failed to submit payment receipt. Please check your permissions and try again.');
    }
    
    console.log('[submitManualPayment] Payment receipt submitted successfully:', {
      orderId,
      paymentMethod,
      payment_status: 'submitted', // Status set by RPC
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

