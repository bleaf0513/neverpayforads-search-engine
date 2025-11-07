// Utility function to fetch bank logos from online sources when missing

const LOGO_CACHE = new Map<string, string | null>();

/**
 * Normalize bank name for logo search
 */
function normalizeBankName(bankName: string): string {
  if (!bankName) return '';
  
  return bankName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Get bank logo from online sources
 * Uses multiple strategies:
 * 1. Clearbit Logo API (free tier)
 * 2. Google Search API (if available)
 * 3. Generic bank logo placeholder services
 */
export async function fetchBankLogo(bankName: string): Promise<string | null> {
  if (!bankName || !bankName.trim()) return null;
  
  // Check cache first
  const cacheKey = normalizeBankName(bankName);
  if (LOGO_CACHE.has(cacheKey)) {
    return LOGO_CACHE.get(cacheKey) || null;
  }
  
  try {
    // Strategy 1: Try to extract domain from bank name and use Clearbit
    // For banks like "Chase Bank", try "chase.com"
    const bankWords = bankName.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const primaryWord = bankWords[0] || '';
    
    // Common bank domain patterns
    const domainAttempts = [
      `${primaryWord}.com`,
      `${primaryWord}bank.com`,
      `www.${primaryWord}.com`,
    ];
    
    for (const domain of domainAttempts) {
      try {
        // Use Clearbit Logo API (free, no API key needed for basic usage)
        const clearbitUrl = `https://logo.clearbit.com/${domain}`;
        const response = await fetch(clearbitUrl, { method: 'HEAD' });
        
        if (response.ok) {
          LOGO_CACHE.set(cacheKey, clearbitUrl);
          return clearbitUrl;
        }
      } catch (e) {
        // Continue to next attempt
      }
    }
    
    // Strategy 2: Use a generic logo service
    // Some banks might have logos on CDNs or public services
    const normalizedName = bankName.toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .replace(/\s+/g, '');
    
    // Try common patterns
    const logoUrls = [
      `https://img.icons8.com/color/96/${normalizedName}.png`,
      `https://logo.clearbit.com/${normalizedName}.com`,
    ];
    
    for (const url of logoUrls) {
      try {
        const response = await fetch(url, { method: 'HEAD' });
        if (response.ok && response.headers.get('content-type')?.startsWith('image/')) {
          LOGO_CACHE.set(cacheKey, url);
          return url;
        }
      } catch (e) {
        // Continue
      }
    }
    
    // Strategy 3: Use a placeholder service that generates logos
    // For banks without logos, we'll use a service that generates colored logos
    // Based on the bank name initials
    const initials = bankName
      .split(/\s+/)
      .map(w => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();
    
    if (initials.length > 0) {
      // Use a service that generates logos with initials
      // This is a fallback - we'll use a data URI with SVG
      const colors = [
        '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
        '#06b6d4', '#ec4899', '#14b8a6'
      ];
      const colorIndex = bankName.charCodeAt(0) % colors.length;
      const bgColor = colors[colorIndex];
      
      const svgLogo = `
        <svg width="96" height="96" xmlns="http://www.w3.org/2000/svg">
          <rect width="96" height="96" fill="${bgColor}" rx="12"/>
          <text x="48" y="48" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">${initials}</text>
        </svg>
      `.trim();
      
      const dataUri = `data:image/svg+xml;base64,${btoa(svgLogo)}`;
      LOGO_CACHE.set(cacheKey, dataUri);
      return dataUri;
    }
    
    LOGO_CACHE.set(cacheKey, null);
    return null;
  } catch (error) {
    console.error(`Error fetching logo for ${bankName}:`, error);
    LOGO_CACHE.set(cacheKey, null);
    return null;
  }
}

/**
 * Get bank logo URL - tries local first, then online
 */
export async function getBankLogo(bankName: string, existingLogo: string | null | undefined): Promise<string | null> {
  // If we already have a logo, use it
  if (existingLogo) {
    // Check if it's a valid path (starts with /)
    if (existingLogo.startsWith('/')) {
      return existingLogo;
    }
    // If it's already a full URL, use it
    if (existingLogo.startsWith('http')) {
      return existingLogo;
    }
    // If it's a data URI, use it
    if (existingLogo.startsWith('data:')) {
      return existingLogo;
    }
  }
  
  // Try to find in local bank-icon-map (synchronous check)
  try {
    // Note: This requires the file to be accessible, which may not work in all environments
    // We'll skip this for now and rely on online fetching
    // If you have the bank-icon-map.json in public/data, you can fetch it via API
  } catch (e) {
    // Icon map not available, continue
  }
  
  // If no local logo, try to fetch online
  return await fetchBankLogo(bankName);
}

