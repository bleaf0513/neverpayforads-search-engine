import fs from 'fs';
import path from 'path';
import { getDb } from '@/lib/db';

// Enhanced bank name to icon mapping logic
function normalizeBank(bankName: string): string {
  return bankName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findBestIconMatch(bankName: string, availableIcons: string[]): string | null {
  const normalized = normalizeBank(bankName);
  
  // Handle AMEX variations first
  if (normalized.includes('amex') || normalized.includes('american express')) {
    return 'AmericanExpress.svg';
  }
  
  // Direct mapping for known variations
  const directMappings: Record<string, string> = {
    'wise brasil pagamentos ltda': 'wise.png',
    'wise europe sa nv': 'wise.png',
    'wise payments limited': 'wise.png',
    'wise us inc': 'wise.png',
    'wise australia pty ltd': 'wise.png',
    'wise payments canada inc': 'wise.png',
    'wise payments japan k k': 'wise.png',
    'banco santander s a': 'banco_santander_s_a.png',
    'santander': 'banco_santander_s_a.png',
    'santander bank': 'banco_santander_s_a.png',
    'banco santander brasil s a': 'banco_santander_s_a.png',
    'banco santander totta s a': 'banco_santander_s_a.png',
    'santander bank polska s a': 'banco_santander_s_a.png',
    'american express': 'AmericanExpress.svg',
    'american express us consumer': 'AmericanExpress.svg',
    'amex': 'AmericanExpress.svg',
    'bank of america': 'BankofAmerica.svg',
    'bank of america national association': 'BankofAmerica.svg',
    'bofa': 'BankofAmerica.svg',
    'barclays': 'Barclays.jpeg',
    'barclays bank delaware': 'Barclays.jpeg',
    'barclays bank ireland plc': 'Barclays.jpeg',
    'capital one': 'CapitalOne.png',
    'capital one national association': 'CapitalOne.png',
    'capital one bank canada branch': 'CapitalOne.png',
    'charles schwab': 'CharlesSchwab.svg',
    'charles schwab bank ssb': 'CharlesSchwab.svg',
    'chase': 'ChaseBank.png',
    'chase bank': 'ChaseBank.png',
    'chase bank usa n a': 'ChaseBank.png',
    'jpmorgan chase': 'ChaseBank.png',
    'jpmorgan chase bank n a': 'ChaseBank.png',
    'jpmorgan chase bank n a debit': 'ChaseBank.png',
    'commerzbank': 'commerzbank_ag.png',
    'commerzbank ag': 'commerzbank_ag.png',
    'deutsche kreditbank': 'deutsche_kreditbank_ag.png',
    'deutsche kreditbank ag': 'deutsche_kreditbank_ag.png',
    'deutsche kreditbank aktiengesellschaft': 'deutsche_kreditbank_ag.png',
    'dkb': 'deutsche_kreditbank_ag.png',
    'home trust': 'home_trust_company.png',
    'home trust company': 'home_trust_company.png',
    'hsbc': 'HSBC.png',
    'hsbc bank': 'HSBC.png',
    'hsbc bank usa national association': 'HSBC.png',
    'hsbc bank australia ltd': 'HSBC.png',
    'hsbc bank malta plc': 'HSBC.png',
    'hsbc continental europe': 'HSBC.png',
    'ing': 'ING.png',
    'ing belgium': 'ING.png',
    'ing bank': 'ING.png',
    'ing bank n v': 'ING.png',
    'ing bank australia ltd': 'ING.png',
    'ing diba ag': 'ING.png',
    'ing bank slaski sa': 'ING.png',
    'ing belgium sa nv': 'ING.png',
    'jpmorgan': 'JPMorgan.jpeg',
    'jp morgan': 'JPMorgan.jpeg',
    'jpmorgan chase bank': 'JPMorgan.jpeg',
    'nium': 'nium.jpg',
    'nium pte ltd': 'nium.jpg',
    'rabobank': 'Rabobank.svg',
    'cooperatieve rabobank u a': 'Rabobank.svg',
    'cooperative rabobank u a': 'Rabobank.svg',
    'spar nord': 'spar_nord.png',
    'spar nord bank a s': 'spar_nord.png',
    'sumitomo': 'sumitomo.png',
    'sumitomo mitsui': 'sumitomo.png',
    'sumitomo mitsui card company ltd': 'sumitomo.png',
    'sumitomo mitsui trust club co ltd': 'sumitomo.png',
    'primary sumitomo mitsui card co ltd': 'sumitomo.png',
    'usaa': 'usaa_federal_savings_bank.png',
    'usaa federal savings bank': 'usaa_federal_savings_bank.png',
    'usaa federal savings bank credit': 'usaa_federal_savings_bank.png',
    'usaa savings bank': 'usaa_federal_savings_bank.png',
    'vestjysk': 'VESTJYSK.jpeg',
    'vestjysk bank a s': 'VESTJYSK.jpeg',
    'wex': 'wex.jpeg',
    'wex bank': 'wex.jpeg',
    'wex finance inc': 'wex.jpeg',
    // New mappings based on added icons
    'caixabank s a': 'caixabank.png',
    'caixabank': 'caixabank.png',
    'citibank n a': 'citibank.jpeg',
    'citibank': 'citibank.jpeg',
    'citibank europe plc': 'citibank.jpeg',
    'citibank n a costco': 'citibank.jpeg',
    'deutscher sparkassen und giroverband': 'deutscher_sparkassen.png',
    'sparkassen': 'deutscher_sparkassen.png',
    'international card services b v': 'international_card_services.jpeg',
    'international card services': 'international_card_services.jpeg',
    'hypothekarbank lenzburg': 'HYPOTHEKARBANK.png',
    'hypothekarbank': 'HYPOTHEKARBANK.png',
    'lotus money services ltd': 'lotus_money_services.jpg',
    'lotus money services': 'lotus_money_services.jpg',
    'optal financial europe ltd': 'optal.jpg',
    'optal financial': 'optal.jpg',
    'optal': 'optal.jpg',
    'rakuten card co ltd': 'rakuten_card.png',
    'rakuten card': 'rakuten_card.png',
    'rakuten': 'rakuten_card.png'
  };

  // Check direct mapping first
  if (directMappings[normalized]) {
    return directMappings[normalized];
  }

  // Try fuzzy matching with available icons
  for (const icon of availableIcons) {
    const iconName = path.basename(icon, path.extname(icon)).toLowerCase();
    
    // Check if bank name contains icon name or vice versa
    if (normalized.includes(iconName) || iconName.includes(normalized.split(' ')[0])) {
      return icon;
    }
    
    // Check for partial matches with key words
    const bankWords = normalized.split(' ').filter(w => w.length > 3);
    const iconWords = iconName.replace(/_/g, ' ').split(' ');
    
    for (const bankWord of bankWords) {
      for (const iconWord of iconWords) {
        if (bankWord === iconWord || (bankWord.length > 4 && iconWord.includes(bankWord))) {
          return icon;
        }
      }
    }
  }

  return null;
}

async function copyIconsToPublic() {
  const sourceDir = path.resolve(process.cwd(), '..', 'icons');
  const targetDir = path.resolve(process.cwd(), 'public', 'bank-logos');
  
  // Ensure target directory exists
  fs.mkdirSync(targetDir, { recursive: true });
  
  const iconFiles = fs.readdirSync(sourceDir)
    .filter(file => /\.(png|jpg|jpeg|svg)$/i.test(file));
  
  console.log(`Copying ${iconFiles.length} icons to public folder...`);
  
  for (const file of iconFiles) {
    const source = path.join(sourceDir, file);
    const target = path.join(targetDir, file);
    
    try {
      fs.copyFileSync(source, target);
      console.log(`✓ Copied ${file}`);
    } catch (error) {
      console.error(`✗ Failed to copy ${file}:`, error);
    }
  }
  
  return iconFiles;
}

async function analyzeAndUpdateBankIcons() {
  console.log('Starting bank icon analysis...');
  
  // Copy all icons to public folder
  const availableIcons = await copyIconsToPublic();
  
  // Get bank statistics from database
  const db = getDb();
  const bankStats = db.prepare(`
    SELECT 
      bank_name, 
      COUNT(*) as card_count,
      bank_logo
    FROM cards 
    GROUP BY bank_name 
    ORDER BY card_count DESC
  `).all() as Array<{bank_name: string, card_count: number, bank_logo: string | null}>;
  
  console.log(`Analyzing ${bankStats.length} unique banks...`);
  
  const iconMap: Record<string, string> = {};
  const missingIcons: Array<{bank_name: string, card_count: number, suggested_search: string}> = [];
  let matchedCount = 0;
  
  for (const bank of bankStats) {
    const match = findBestIconMatch(bank.bank_name, availableIcons);
    
    if (match) {
      iconMap[bank.bank_name] = `/bank-logos/${match}`;
      matchedCount++;
      console.log(`✓ ${bank.bank_name} → ${match} (${bank.card_count} cards)`);
    } else {
      // Generate search suggestions
      const normalized = normalizeBank(bank.bank_name);
      const words = normalized.split(' ').filter(w => w.length > 2);
      const searchTerm = words.slice(0, 2).join(' ') || normalized;
      
      missingIcons.push({
        bank_name: bank.bank_name,
        card_count: bank.card_count,
        suggested_search: searchTerm
      });
      console.log(`✗ ${bank.bank_name} (${bank.card_count} cards) - No icon found`);
    }
  }
  
  // Update database with new icon mappings
  console.log(`\nUpdating database with ${matchedCount} icon mappings...`);
  const updateStmt = db.prepare('UPDATE cards SET bank_logo = ? WHERE bank_name = ?');
  const updateMany = db.transaction((updates: Array<{logo: string, bank: string}>) => {
    for (const {logo, bank} of updates) {
      updateStmt.run(logo, bank);
    }
  });
  
  const updates = Object.entries(iconMap).map(([bank, logo]) => ({logo, bank}));
  updateMany(updates);
  
  // Save results
  const outputDir = path.resolve(process.cwd(), 'data');
  fs.mkdirSync(outputDir, { recursive: true });
  
  // Save icon mapping
  fs.writeFileSync(
    path.join(outputDir, 'bank-icon-map.json'),
    JSON.stringify(iconMap, null, 2)
  );
  
  // Save missing icons report
  fs.writeFileSync(
    path.join(outputDir, 'missing-bank-icons.json'),
    JSON.stringify({
      summary: {
        total_banks: bankStats.length,
        matched_banks: matchedCount,
        missing_banks: missingIcons.length,
        total_cards_with_icons: bankStats
          .filter(b => iconMap[b.bank_name])
          .reduce((sum, b) => sum + b.card_count, 0),
        total_cards_without_icons: missingIcons
          .reduce((sum, b) => sum + b.card_count, 0)
      },
      missing_icons: missingIcons
    }, null, 2)
  );
  
  db.close();
  
  console.log(`\n📊 SUMMARY:`);
  console.log(`✓ Matched: ${matchedCount}/${bankStats.length} banks`);
  console.log(`✗ Missing: ${missingIcons.length} banks`);
  console.log(`📁 Icon map saved to: data/bank-icon-map.json`);
  console.log(`📋 Missing icons report: data/missing-bank-icons.json`);
  
  return {
    matched: matchedCount,
    missing: missingIcons.length,
    iconMap,
    missingIcons
  };
}

// Run the analysis
analyzeAndUpdateBankIcons().catch(console.error);
