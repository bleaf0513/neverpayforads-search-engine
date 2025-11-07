import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { parse } from 'csv-parse/sync';
import geoip from 'geoip-lite';
import { getDb, migrate } from '@/lib/db';
import { normalizeExpiry, isExpiryAtLeast } from '@/lib/date';
import { fileURLToPath } from 'url';

type BinRow = {
  BIN: string;
  Issuer: string;
  IssuerUrl?: string;
  CountryName?: string;
};

function loadBinMap(binCsvPath: string) {
  const csv = fs.readFileSync(binCsvPath, 'utf8');
  const rows = parse(csv, { columns: true, skip_empty_lines: true }) as BinRow[];
  const map = new Map<string, BinRow>();
  for (const r of rows) map.set(r.BIN.trim(), r);
  return map;
}

function extractBin(pan: string) {
  const digits = (pan || '').replace(/\D/g, '');
  if (digits.length >= 8) return digits.slice(0, 8);
  if (digits.length >= 6) return digits.slice(0, 6);
  return null;
}

function pickEmail(parts: string[]) {
  for (let i = 0; i < Math.min(parts.length, 20); i++) {
    const v = (parts[i] || '').trim();
    if (v.includes('@')) return v;
  }
  return '';
}

function pickPhone(parts: string[]) {
  const primary = (parts[9] || '').trim();
  if (primary) return primary;
  const phoneRegex = /^(?:\+?\d[\d\s\-()]{6,}\d)$/;
  for (let i = 0; i < Math.min(parts.length, 20); i++) {
    const v = (parts[i] || '').trim();
    if (!v || v.includes('@') || /https?:\/\//i.test(v)) continue;
    if (phoneRegex.test(v)) return v;
  }
  return '';
}

async function processBatchFile(filePath: string, binMap: Map<string, BinRow>, iconMap: any, publicLogosDir: string, insertMany: any) {
  console.log(`Processing ${path.basename(filePath)}...`);
  const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
  const batch: any[] = [];
  let processed = 0;
  let kept = 0;

  for await (const line of rl) {
    if (!line || line.startsWith('#')) continue;
    const parts = line.split('|');
    const pan = parts[0] || '';
    const expiryRaw = (parts[1] || '').trim();
    const name = (parts[3] || '').trim();
    const ip = (parts[12] || '').trim();
    const email = pickEmail(parts);
    const phone = pickPhone(parts);
    if (!name || (!email && !phone)) continue; // require at least one contact method

    // Normalize and validate expiry: only keep >= 09/2025
    const normalizedExpiry = normalizeExpiry(expiryRaw);
    if (!normalizedExpiry) continue;
    if (!isExpiryAtLeast(normalizedExpiry, { year: 2025, month: 9 })) continue;

    const bin = extractBin(pan);
    if (!bin) continue;
    let row = binMap.get(bin);
    if (!row && bin.length === 8) row = binMap.get(bin.slice(0, 6));

    const bankName = (row?.Issuer || 'Unknown Issuer').trim();
    let bankLogo: string | null = null;
    const logoSource = iconMap[bankName] || null;
    if (logoSource && fs.existsSync(logoSource)) {
      const base = path.basename(logoSource);
      const dest = path.join(publicLogosDir, base);
      try {
        if (!fs.existsSync(dest)) fs.copyFileSync(logoSource, dest);
        bankLogo = `/bank-logos/${base}`;
      } catch {
        bankLogo = null;
      }
    }
    const bankUrl = (row?.IssuerUrl || '').trim() || null;

    let latitude: number | null = null;
    let longitude: number | null = null;
    let countryCode: string | null = null;
    let countryName: string | null = null;
    let stateCode: string | null = null;
    let stateName: string | null = null;
    let city: string | null = null;
    
    if (ip) {
      const gi = geoip.lookup(ip);
      if (gi) {
        countryCode = gi.country || null;
        // Get full country name from country code
        if (countryCode) {
          const countryNames: Record<string, string> = {
            'US': 'United States', 'CA': 'Canada', 'GB': 'United Kingdom', 'DE': 'Germany',
            'FR': 'France', 'IT': 'Italy', 'ES': 'Spain', 'NL': 'Netherlands', 'BE': 'Belgium',
            'CH': 'Switzerland', 'AT': 'Austria', 'SE': 'Sweden', 'NO': 'Norway', 'DK': 'Denmark',
            'FI': 'Finland', 'PL': 'Poland', 'CZ': 'Czech Republic', 'HU': 'Hungary', 'SK': 'Slovakia',
            'SI': 'Slovenia', 'HR': 'Croatia', 'BA': 'Bosnia and Herzegovina', 'RS': 'Serbia',
            'ME': 'Montenegro', 'MK': 'Macedonia', 'BG': 'Bulgaria', 'RO': 'Romania', 'GR': 'Greece',
            'CY': 'Cyprus', 'MT': 'Malta', 'PT': 'Portugal', 'IE': 'Ireland', 'IS': 'Iceland',
            'LU': 'Luxembourg', 'LI': 'Liechtenstein', 'MC': 'Monaco', 'SM': 'San Marino',
            'VA': 'Vatican City', 'AD': 'Andorra', 'RU': 'Russia', 'UA': 'Ukraine', 'BY': 'Belarus',
            'MD': 'Moldova', 'LT': 'Lithuania', 'LV': 'Latvia', 'EE': 'Estonia', 'GE': 'Georgia',
            'AM': 'Armenia', 'AZ': 'Azerbaijan', 'KZ': 'Kazakhstan', 'KG': 'Kyrgyzstan',
            'TJ': 'Tajikistan', 'TM': 'Turkmenistan', 'UZ': 'Uzbekistan', 'MN': 'Mongolia',
            'CN': 'China', 'JP': 'Japan', 'KR': 'South Korea', 'KP': 'North Korea', 'TW': 'Taiwan',
            'HK': 'Hong Kong', 'MO': 'Macau', 'SG': 'Singapore', 'MY': 'Malaysia', 'TH': 'Thailand',
            'VN': 'Vietnam', 'LA': 'Laos', 'KH': 'Cambodia', 'MM': 'Myanmar', 'BD': 'Bangladesh',
            'BT': 'Bhutan', 'NP': 'Nepal', 'IN': 'India', 'LK': 'Sri Lanka', 'MV': 'Maldives',
            'PK': 'Pakistan', 'AF': 'Afghanistan', 'IR': 'Iran', 'IQ': 'Iraq', 'SY': 'Syria',
            'LB': 'Lebanon', 'JO': 'Jordan', 'IL': 'Israel', 'PS': 'Palestine', 'SA': 'Saudi Arabia',
            'YE': 'Yemen', 'OM': 'Oman', 'AE': 'United Arab Emirates', 'QA': 'Qatar', 'BH': 'Bahrain',
            'KW': 'Kuwait', 'TR': 'Turkey', 'EG': 'Egypt', 'LY': 'Libya', 'TN': 'Tunisia',
            'DZ': 'Algeria', 'MA': 'Morocco', 'SD': 'Sudan', 'SS': 'South Sudan', 'ET': 'Ethiopia',
            'ER': 'Eritrea', 'DJ': 'Djibouti', 'SO': 'Somalia', 'KE': 'Kenya', 'UG': 'Uganda',
            'TZ': 'Tanzania', 'RW': 'Rwanda', 'BI': 'Burundi', 'CD': 'Democratic Republic of Congo',
            'CG': 'Republic of Congo', 'CF': 'Central African Republic', 'CM': 'Cameroon',
            'TD': 'Chad', 'NE': 'Niger', 'NG': 'Nigeria', 'BJ': 'Benin', 'TG': 'Togo',
            'GH': 'Ghana', 'CI': 'Ivory Coast', 'LR': 'Liberia', 'SL': 'Sierra Leone',
            'GN': 'Guinea', 'GW': 'Guinea-Bissau', 'GM': 'Gambia', 'SN': 'Senegal',
            'MR': 'Mauritania', 'ML': 'Mali', 'BF': 'Burkina Faso', 'CV': 'Cape Verde',
            'ST': 'Sao Tome and Principe', 'GQ': 'Equatorial Guinea', 'GA': 'Gabon',
            'AO': 'Angola', 'ZM': 'Zambia', 'ZW': 'Zimbabwe', 'BW': 'Botswana', 'NA': 'Namibia',
            'ZA': 'South Africa', 'LS': 'Lesotho', 'SZ': 'Swaziland', 'MZ': 'Mozambique',
            'MW': 'Malawi', 'MG': 'Madagascar', 'MU': 'Mauritius', 'SC': 'Seychelles',
            'KM': 'Comoros', 'AU': 'Australia', 'NZ': 'New Zealand', 'PG': 'Papua New Guinea',
            'FJ': 'Fiji', 'VU': 'Vanuatu', 'NC': 'New Caledonia', 'PF': 'French Polynesia',
            'WS': 'Samoa', 'TO': 'Tonga', 'TV': 'Tuvalu', 'KI': 'Kiribati', 'NR': 'Nauru',
            'PW': 'Palau', 'FM': 'Micronesia', 'MH': 'Marshall Islands', 'SB': 'Solomon Islands',
            'BR': 'Brazil', 'AR': 'Argentina', 'CL': 'Chile', 'PE': 'Peru', 'BO': 'Bolivia',
            'PY': 'Paraguay', 'UY': 'Uruguay', 'CO': 'Colombia', 'VE': 'Venezuela', 'GY': 'Guyana',
            'SR': 'Suriname', 'GF': 'French Guiana', 'EC': 'Ecuador', 'MX': 'Mexico', 'GT': 'Guatemala',
            'BZ': 'Belize', 'SV': 'El Salvador', 'HN': 'Honduras', 'NI': 'Nicaragua', 'CR': 'Costa Rica',
            'PA': 'Panama', 'CU': 'Cuba', 'JM': 'Jamaica', 'HT': 'Haiti', 'DO': 'Dominican Republic',
            'PR': 'Puerto Rico', 'VI': 'US Virgin Islands', 'AI': 'Anguilla', 'AG': 'Antigua and Barbuda',
            'DM': 'Dominica', 'LC': 'Saint Lucia', 'VC': 'Saint Vincent and the Grenadines',
            'GD': 'Grenada', 'BB': 'Barbados', 'TT': 'Trinidad and Tobago', 'KN': 'Saint Kitts and Nevis',
            'MS': 'Montserrat', 'VG': 'British Virgin Islands', 'TC': 'Turks and Caicos Islands',
            'BS': 'Bahamas', 'BM': 'Bermuda', 'GL': 'Greenland', 'PM': 'Saint Pierre and Miquelon',
            'ID': 'Indonesia', 'PH': 'Philippines'
          };
          countryName = countryNames[countryCode] || countryCode;
        }
        
        stateCode = Array.isArray(gi.region) ? gi.region[0] : (gi.region || null);
        // For now, use state code as state name - could be enhanced with state name mapping
        stateName = stateCode;
        city = gi.city || null;
        
        if (Array.isArray(gi.ll)) {
          latitude = gi.ll[0] ?? null;
          longitude = gi.ll[1] ?? null;
        }
      }
    }

    batch.push({
      card_number: pan,
      cardholder_name: name,
      bank_name: bankName,
      bank_url: bankUrl,
      bank_logo: bankLogo,
      expiry_date: normalizedExpiry,
      country_code: countryCode,
      country_name: countryName,
      state_code: stateCode,
      state_name: stateName,
      city: city,
      owner_phone: phone,
      owner_email: email,
      latitude,
      longitude,
    });

    if (batch.length >= 500) {
      insertMany(batch.splice(0, batch.length));
      kept += 500;
    }
    processed += 1;
    if (processed % 50000 === 0) console.log(`Processed ${processed} lines`);
  }
  if (batch.length) { insertMany(batch); kept += batch.length; }
  console.log(`Finished ${path.basename(filePath)}: processed=${processed}, kept=${kept}`);
  return { processed, kept };
}

async function main() {
  const batchDir = process.env.BATCH_DIR || path.resolve(process.cwd(), '..', '1 Million');
  const binCsv = process.env.BIN_CSV || path.resolve(process.cwd(), '../bin-list-data.csv');
  const iconMapPath = process.env.ICON_MAP || path.resolve(process.cwd(), '../output/icon-map.json');
  const dbPath = process.env.DB_PATH || path.resolve(process.cwd(), 'public/data/cards.db');

  console.log(`Batch directory: ${batchDir}`);
  console.log(`Database path: ${dbPath}`);

  migrate(dbPath);
  const db = getDb(dbPath);
  // Reset table so ingest is idempotent
  db.exec('DELETE FROM cards; VACUUM;');
  const insert = db.prepare(`INSERT INTO cards
    (card_number, cardholder_name, bank_name, bank_url, bank_logo, expiry_date, country_code, country_name, state_code, state_name, city, owner_phone, owner_email, latitude, longitude)
    VALUES (@card_number, @cardholder_name, @bank_name, @bank_url, @bank_logo, @expiry_date, @country_code, @country_name, @state_code, @state_name, @city, @owner_phone, @owner_email, @latitude, @longitude)`);
  const insertMany = db.transaction((rows: any[]) => {
    for (const r of rows) insert.run(r);
  });

  const binMap = loadBinMap(binCsv);
  const iconMap = fs.existsSync(iconMapPath) ? JSON.parse(fs.readFileSync(iconMapPath, 'utf8')) : {};
  const publicLogosDir = path.resolve(process.cwd(), 'public', 'bank-logos');
  fs.mkdirSync(publicLogosDir, { recursive: true });

  // Find all batch files
  const batchFiles = fs.readdirSync(batchDir)
    .filter(f => f.startsWith('batch_') && f.endsWith('.txt'))
    .sort((a, b) => {
      const numA = parseInt(a.match(/batch_(\d+)\.txt/)?.[1] || '0');
      const numB = parseInt(b.match(/batch_(\d+)\.txt/)?.[1] || '0');
      return numA - numB;
    })
    .map(f => path.join(batchDir, f));

  console.log(`Found ${batchFiles.length} batch files to process`);

  let totalProcessed = 0;
  let totalKept = 0;

  for (const batchFile of batchFiles) {
    const { processed, kept } = await processBatchFile(batchFile, binMap, iconMap, publicLogosDir, insertMany);
    totalProcessed += processed;
    totalKept += kept;
  }

  db.close();
  console.log(`Ingestion complete. Total processed=${totalProcessed}, total inserted=${totalKept}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


