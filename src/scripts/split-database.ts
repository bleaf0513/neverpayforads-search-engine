import fs from 'fs';
import path from 'path';
import { getDb, migrate } from '@/lib/db';

const MAX_SIZE_MB = 100;
const CHUNK_SIZE = 50000; // Records per chunk to estimate

async function main() {
  const sourceDbPath = process.env.SOURCE_DB || path.resolve(process.cwd(), 'public/data/cards.db');
  const outputDir = path.resolve(process.cwd(), 'public/data');
  
  console.log('Reading source database:', sourceDbPath);
  const sourceDb = getDb(sourceDbPath);
  
  // Get total count
  const totalCount = sourceDb.prepare('SELECT COUNT(*) as count FROM cards').get() as { count: number };
  console.log('Total records:', totalCount.count);
  
  // Calculate approximate records per chunk based on file size
  const fileStats = fs.statSync(sourceDbPath);
  const fileSizeMB = fileStats.size / (1024 * 1024);
  console.log('Source file size:', fileSizeMB.toFixed(2), 'MB');
  
  const recordsPerMB = totalCount.count / fileSizeMB;
  const recordsPerChunk = Math.floor(recordsPerMB * MAX_SIZE_MB);
  const numberOfChunks = Math.ceil(totalCount.count / recordsPerChunk);
  
  console.log(`Will create ${numberOfChunks} chunks with ~${recordsPerChunk} records each`);
  
  // Clean up existing chunk files
  const existingChunks = fs.readdirSync(outputDir).filter(f => f.match(/^cards_\d+\.db$/));
  for (const chunk of existingChunks) {
    fs.unlinkSync(path.join(outputDir, chunk));
    console.log('Removed existing chunk:', chunk);
  }
  
  // Create chunks
  for (let chunkIndex = 0; chunkIndex < numberOfChunks; chunkIndex++) {
    const chunkPath = path.join(outputDir, `cards_${chunkIndex + 1}.db`);
    console.log(`Creating chunk ${chunkIndex + 1}/${numberOfChunks}: ${path.basename(chunkPath)}`);
    
    // Create and migrate chunk database
    migrate(chunkPath);
    const chunkDb = getDb(chunkPath);
    
    const insert = chunkDb.prepare(`INSERT INTO cards
      (card_number, cardholder_name, bank_name, bank_url, bank_logo, expiry_date, country_code, country_name, state_code, state_name, city, owner_phone, owner_email, latitude, longitude)
      VALUES (@card_number, @cardholder_name, @bank_name, @bank_url, @bank_logo, @expiry_date, @country_code, @country_name, @state_code, @state_name, @city, @owner_phone, @owner_email, @latitude, @longitude)`);
    
    const insertMany = chunkDb.transaction((rows: any[]) => {
      for (const r of rows) insert.run(r);
    });
    
    // Copy records for this chunk
    const offset = chunkIndex * recordsPerChunk;
    const rows = sourceDb.prepare('SELECT * FROM cards ORDER BY id LIMIT ? OFFSET ?').all(recordsPerChunk, offset);
    
    if (rows.length > 0) {
      insertMany(rows);
      console.log(`  Inserted ${rows.length} records`);
    }
    
    chunkDb.close();
    
    // Check chunk size
    const chunkStats = fs.statSync(chunkPath);
    const chunkSizeMB = chunkStats.size / (1024 * 1024);
    console.log(`  Chunk size: ${chunkSizeMB.toFixed(2)} MB`);
  }
  
  sourceDb.close();
  
  // Create index file
  const indexPath = path.join(outputDir, 'database-index.json');
  const index = {
    chunks: numberOfChunks,
    totalRecords: totalCount.count,
    recordsPerChunk,
    files: Array.from({ length: numberOfChunks }, (_, i) => `cards_${i + 1}.db`)
  };
  
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  console.log('Created database index:', path.basename(indexPath));
  
  console.log('\nSplit complete!');
  console.log('Original file can be removed if desired');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
