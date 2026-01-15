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

  // For private buckets, we store the path (not a public URL)
  // The path can be used to generate signed URLs when needed
  // Store the full path: payment-receipts/{orderId}/{timestamp}.{ext}
  const receiptPath = `${bucketName}/${fileName}`;
  
  return receiptPath;
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
    // Fetch order first to get buyer_email for debugging
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .select('buyer_email, buyer_user_id')
      .eq('id', orderId)
      .single();

    if (orderError) {
      console.warn('[submitManualPayment] Could not fetch order for debugging:', orderError);
    } else {
      console.log('[submitManualPayment] Order buyer_email:', {
        orderId,
        buyer_email: orderData.buyer_email,
        buyer_user_id: orderData.buyer_user_id,
        normalized_buyer_email: orderData.buyer_email ? orderData.buyer_email.trim().toLowerCase() : null,
      });
    }

    // Get current user email from JWT for debugging
    const { data: { user } } = await supabase.auth.getUser();
    const jwtEmail = user?.email;
    console.log('[submitManualPayment] Current user email from JWT:', {
      orderId,
      jwt_email: jwtEmail,
      normalized_jwt_email: jwtEmail ? jwtEmail.trim().toLowerCase() : null,
      user_id: user?.id,
    });

    // Upload receipt
    const receiptUrl = await uploadReceipt(orderId, receiptFile);
    console.log('[submitManualPayment] Receipt uploaded, submitting via RPC:', {
      orderId,
      receiptUrl,
    });

    // Call RPC function to submit payment receipt
    // This sets payment_status='submitted' but does NOT mark as paid
    const { error: rpcError } = await supabase.rpc('submit_payment_receipt', {
      p_order_id: orderId,
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
        order_buyer_email: orderData?.buyer_email,
        normalized_order_buyer_email: orderData?.buyer_email ? orderData.buyer_email.trim().toLowerCase() : null,
        jwt_email: jwtEmail,
        normalized_jwt_email: jwtEmail ? jwtEmail.trim().toLowerCase() : null,
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

