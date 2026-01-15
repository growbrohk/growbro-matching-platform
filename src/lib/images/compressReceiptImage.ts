/**
 * Compress receipt images to WebP format targeting <= 500KB
 * 
 * - Resizes images: long edge <= 1400px (maintains aspect ratio)
 * - Converts to image/webp
 * - Iteratively reduces quality until size <= 500KB or quality <= 0.6
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

/**
 * Compress receipt image to WebP format targeting <= 500KB
 * 
 * @param file - The image file to compress
 * @returns Compressed File (WebP format) or original file if not an image
 */
export async function compressReceiptImage(file: File): Promise<File> {
  // If not an image, return as-is
  if (!file.type.startsWith('image/')) {
    return file;
  }

  try {
    // Load image
    const img = await loadImage(file);
    const originalUrl = img.src;
    
    // Calculate dimensions: resize long edge to <= 1400px, maintain aspect ratio
    const maxDimension = 1400;
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
    
    // Create canvas
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
    
    // Target size: 500KB
    const targetSize = 500_000;
    const minQuality = 0.6;
    
    // Start with quality ~0.82, reduce by ~0.08 per iteration
    let quality = 0.82;
    let blob: Blob | null = null;
    let attempts = 0;
    const maxAttempts = 7;
    
    while (attempts < maxAttempts && quality >= minQuality) {
      blob = await toBlob(canvas, quality);
      
      if (blob.size <= targetSize) {
        break;
      }
      
      quality -= 0.08;
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
    
    return compressedFile;
  } catch (error) {
    console.error('[compressReceiptImage] Compression failed:', error);
    throw error;
  }
}

