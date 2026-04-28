/**
 * Compress receipt images to WebP format targeting < 50KB
 * 
 * - Resizes images: long edge <= 1400px (maintains aspect ratio)
 * - Converts to image/webp
 * - Iteratively reduces quality until size < 50KB or quality <= 0.3
 * - Returns original file if not an image type
 */

/**
 * Helper: Replace file extension
 */
function replaceExt(filename: string, newExt: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) {
    return `${filename}.${newExt}`;
  }
  return `${filename.substring(0, lastDot)}.${newExt}`;
}

/**
 * Helper: Load image from File
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (error) => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Helper: Convert canvas to Blob with quality
 */
function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to convert canvas to blob'));
        }
      },
      'image/webp',
      quality
    );
  });
}

export interface CompressImageOptions {
  targetSizeBytes?: number;
  maxDimension?: number;
}

export interface CompressedWebpResult {
  file: File;
  /** Output pixel width after resize (for og:image:width) */
  width: number;
  /** Output pixel height after resize (for og:image:height) */
  height: number;
}

/**
 * Compress image to WebP and return output dimensions (for Open Graph meta tags).
 */
export async function compressImageToWebp(
  file: File,
  options?: CompressImageOptions
): Promise<CompressedWebpResult> {
  if (!file.type.startsWith('image/')) {
    return { file, width: 0, height: 0 };
  }

  const targetSize = options?.targetSizeBytes ?? 50 * 1024;
  const maxDimension = options?.maxDimension ?? 1400;

  try {
    const img = await loadImage(file);
    const originalUrl = img.src;

    let width = img.width;
    let height = img.height;

    if (width > maxDimension || height > maxDimension) {
      if (width > height) {
        height = (height / width) * maxDimension;
        width = maxDimension;
      } else {
        width = (width / height) * maxDimension;
        height = maxDimension;
      }
    }

    width = Math.max(1, Math.round(width));
    height = Math.max(1, Math.round(height));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }
    
    // Draw image to canvas
    ctx.drawImage(img, 0, 0, width, height);
    
    // Clean up object URL
    URL.revokeObjectURL(originalUrl);
    
    const minQuality = 0.3;
    
    // Start with quality ~0.7, reduce by ~0.05 per iteration
    let quality = 0.7;
    let blob: Blob | null = null;
    let attempts = 0;
    const maxAttempts = 10;
    
    while (attempts < maxAttempts && quality >= minQuality) {
      blob = await toBlob(canvas, quality);
      
      if (blob.size < targetSize) {
        break;
      }
      
      quality -= 0.05;
      attempts++;
    }
    
    if (!blob) {
      throw new Error('Failed to compress image');
    }
    
    // Create new File with .webp extension
    const newFileName = replaceExt(file.name, 'webp');
    const compressedFile = new File([blob], newFileName, {
      type: 'image/webp',
      lastModified: Date.now(),
    });

    return { file: compressedFile, width, height };
  } catch (error) {
    console.error('[compressImageToWebp] Compression failed:', error);
    throw error;
  }
}

/**
 * Compress image to WebP format targeting a given size
 *
 * @param file - The image file to compress
 * @param options - Optional: targetSizeBytes (default 50KB), maxDimension (default 1400px)
 * @returns Compressed File (WebP format) or original file if not an image
 */
export async function compressReceiptImage(
  file: File,
  options?: CompressImageOptions
): Promise<File> {
  const r = await compressImageToWebp(file, options);
  return r.file;
}

