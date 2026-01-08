/**
 * Generate a random Base62 short code
 * Base62 uses: 0-9, A-Z, a-z (62 characters total)
 * 
 * @param length - Length of the code (default: 7)
 * @returns A random Base62 string
 */
export function generateShortCode(length: number = 7): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let result = '';
  
  // Use crypto.getRandomValues for better randomness
  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);
  
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  
  return result;
}

/**
 * Generate a lowercase alphanumeric short code for tracking campaigns
 * Uses only 0-9, a-z (36 characters) for safer URLs
 * 
 * @param length - Length of the code (default: 6)
 * @returns A random lowercase alphanumeric string
 */
export function generateTrackingShortCode(length: number = 6): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  let result = '';
  
  // Use crypto.getRandomValues for better randomness
  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);
  
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  
  return result;
}

/**
 * Validate that a short code matches the expected format
 * @param code - The code to validate
 * @returns true if valid
 */
export function isValidShortCode(code: string): boolean {
  // Base62: 0-9, A-Z, a-z
  return /^[0-9A-Za-z]{7,8}$/.test(code);
}

/**
 * Validate that a tracking short code matches the expected format
 * @param code - The code to validate
 * @returns true if valid
 */
export function isValidTrackingShortCode(code: string): boolean {
  // Lowercase alphanumeric: 0-9, a-z
  return /^[0-9a-z]{6,8}$/.test(code);
}

