import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export type CardRecord = {
  id: number;
  card_number: string;
  cardholder_name: string;
  bank_name: string;
  bank_url: string | null;
  bank_logo: string | null;
  expiry_date: string | null; // MM/YY or MM/YYYY
  country_code: string | null;
  country_name: string | null;
  state_code: string | null;
  state_name: string | null;
  city: string | null;
  owner_phone: string | null;
  owner_email: string | null;
  latitude: number | null;
  longitude: number | null;
};

function resolveDefaultDbPath() {
  // Check for chunked databases first
  const indexPath = path.resolve(process.cwd(), 'public', 'data', 'database-index.json');
  if (fs.existsSync(indexPath)) {
    return indexPath; // Return index file path to indicate chunked mode
  }
  
  // Fallback to single database
  const publicPreferred = path.resolve(process.cwd(), 'public', 'data', 'cards.db');
  const publicAlt = path.resolve(process.cwd(), 'public', 'cards.db');
  const primary = path.resolve(process.cwd(), 'data', 'cards.db');
  const alt = path.resolve(process.cwd(), 'web', 'data', 'cards.db');
  if (fs.existsSync(publicPreferred)) return publicPreferred;
  if (fs.existsSync(publicAlt)) return publicAlt;
  if (fs.existsSync(primary)) return primary;
  if (fs.existsSync(alt)) return alt;
  // Default to public preferred path so local dev can place it there
  return publicPreferred;
}

export function resolveDbPath() {
  return process.env.DB_PATH || resolveDefaultDbPath();
}

function ensureDirExists(dirPath: string) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function openDatabaseDirect(dbPath: string) {
  const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
  
  if (isProd) {
    // In serverless/production, copy DB to /tmp which is writable
    const filename = path.basename(dbPath);
    const tempDbPath = `/tmp/${filename}`;
    
    try {
      if (!fs.existsSync(tempDbPath)) {
        fs.copyFileSync(dbPath, tempDbPath);
      }
      
      const db = new Database(tempDbPath, { readonly: true });
      return db;
    } catch (error) {
      // Fallback to original path
      const db = new Database(dbPath, { readonly: true, fileMustExist: true });
      return db;
    }
  }
  
  // Development mode
  const options: any = {};
  const dir = path.dirname(dbPath);
  ensureDirExists(dir);
  
  const db = new Database(dbPath, options);
  db.pragma('journal_mode = WAL');
  return db;
}

export function getDb(dbPath = resolveDbPath()) {
  console.log('[DB] Attempting to open database at:', dbPath);
  console.log('[DB] File exists:', fs.existsSync(dbPath));
  console.log('[DB] Current working directory:', process.cwd());
  console.log('[DB] Environment:', process.env.NODE_ENV);
  console.log('[DB] Is Vercel:', process.env.VERCEL);
  
  // If this is a direct path to a database file (not an index), open it directly
  if (dbPath.endsWith('.db')) {
    return openDatabaseDirect(dbPath);
  }
  
  const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
  
  if (isProd) {
    // In serverless/production, copy DB to /tmp which is writable
    const tempDbPath = '/tmp/cards.db';
    console.log('[DB] Production mode: copying database to temp location:', tempDbPath);
    
    try {
      if (!fs.existsSync(tempDbPath)) {
        fs.copyFileSync(dbPath, tempDbPath);
        console.log('[DB] Database copied to temp location');
      } else {
        console.log('[DB] Temp database already exists, reusing');
      }
      
      const db = new Database(tempDbPath, { readonly: true });
      console.log('[DB] Database opened successfully from temp location');
      
      // Test the database
      const testQuery = db.prepare('SELECT 1 as test').get();
      console.log('[DB] Test query successful:', testQuery);
      
      return db;
    } catch (error) {
      console.error('[DB] Failed with temp approach:', error);
      // Fallback to original path
      dbPath = dbPath;
    }
  }
  
  // Development mode or fallback
  const options: any = isProd ? { readonly: true, fileMustExist: true } : {};
  if (!isProd) {
    const dir = path.dirname(dbPath);
    ensureDirExists(dir);
  }
  
  try {
    const db = new Database(dbPath, options);
    console.log('[DB] Database opened successfully');
    
    if (!isProd) {
      db.pragma('journal_mode = WAL');
    }
    return db;
  } catch (error) {
    console.error('[DB] Failed to open database:', error);
    console.log('[DB] Listing files in current directory:');
    try {
      const files = fs.readdirSync(process.cwd());
      console.log('[DB] Root files:', files);
      if (fs.existsSync(path.join(process.cwd(), 'public'))) {
        const publicFiles = fs.readdirSync(path.join(process.cwd(), 'public'));
        console.log('[DB] Public files:', publicFiles);
        if (fs.existsSync(path.join(process.cwd(), 'public', 'data'))) {
          const dataFiles = fs.readdirSync(path.join(process.cwd(), 'public', 'data'));
          console.log('[DB] Data files:', dataFiles);
        }
      }
    } catch (e) {
      console.log('[DB] Could not list files:', e);
    }
    throw error;
  }
}

export function migrate(dbPath?: string) {
  const db = getDb(dbPath);
  
  // Check if table exists and get its schema
  const tableInfo = db.prepare("PRAGMA table_info(cards)").all();
  const columnNames = tableInfo.map((col: any) => col.name);
  
  if (tableInfo.length === 0) {
    // Table doesn't exist, create it with new schema
    db.exec(`
      CREATE TABLE cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        card_number TEXT NOT NULL,
        cardholder_name TEXT,
        bank_name TEXT,
        bank_url TEXT,
        bank_logo TEXT,
        expiry_date TEXT,
        country_code TEXT,
        country_name TEXT,
        state_code TEXT,
        state_name TEXT,
        city TEXT,
        owner_phone TEXT,
        owner_email TEXT,
        latitude REAL,
        longitude REAL
      );
    `);
  } else if (!columnNames.includes('country_name')) {
    // Table exists but has old schema, recreate it
    db.exec(`
      DROP TABLE IF EXISTS cards;
      CREATE TABLE cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        card_number TEXT NOT NULL,
        cardholder_name TEXT,
        bank_name TEXT,
        bank_url TEXT,
        bank_logo TEXT,
        expiry_date TEXT,
        country_code TEXT,
        country_name TEXT,
        state_code TEXT,
        state_name TEXT,
        city TEXT,
        owner_phone TEXT,
        owner_email TEXT,
        latitude REAL,
        longitude REAL
      );
    `);
  }
  
  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cards_bank ON cards(bank_name);
    CREATE INDEX IF NOT EXISTS idx_cards_holder ON cards(cardholder_name);
    CREATE INDEX IF NOT EXISTS idx_cards_country ON cards(country_code);
    CREATE INDEX IF NOT EXISTS idx_cards_country_name ON cards(country_name);
    CREATE INDEX IF NOT EXISTS idx_cards_state ON cards(state_code);
    CREATE INDEX IF NOT EXISTS idx_cards_cardnum ON cards(card_number);
  `);
  
  db.close();
}

export type CardQuery = {
  country?: string;
  state?: string;
  cardNumber?: string;
  bankName?: string;
  cardholder?: string;
  limit?: number;
  offset?: number;
};

function isChunkedMode(dbPath: string): boolean {
  return dbPath.endsWith('database-index.json');
}

function getChunkInfo(indexPath: string) {
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const dataDir = path.dirname(indexPath);
  return {
    chunks: index.chunks as number,
    totalRecords: index.totalRecords as number,
    recordsPerChunk: index.recordsPerChunk as number,
    files: (index.files as string[]).map(f => path.join(dataDir, f))
  };
}

export function queryCards(q: CardQuery, dbPath?: string) {
  const resolvedPath = dbPath || resolveDbPath();
  
  if (isChunkedMode(resolvedPath)) {
    return queryCardsChunked(q, resolvedPath);
  }
  
  // Single database mode
  const db = getDb(resolvedPath);
  const where: string[] = [];
  const params: Record<string, unknown> = {};

  if (q.country) { where.push('(country_code = @country OR country_name LIKE @countryLike)'); params.country = q.country; params.countryLike = `%${q.country}%`; }
  if (q.state) { where.push('(state_code = @state OR state_name LIKE @stateLike)'); params.state = q.state; params.stateLike = `%${q.state}%`; }
  if (q.cardNumber) { where.push('card_number LIKE @cardNumber'); params.cardNumber = `%${q.cardNumber}%`; }
  if (q.bankName) { where.push('bank_name LIKE @bankName'); params.bankName = `%${q.bankName}%`; }
  if (q.cardholder) { where.push('cardholder_name LIKE @cardholder'); params.cardholder = `%${q.cardholder}%`; }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = Math.max(1, Math.min(q.limit ?? 25, 200));
  const offset = Math.max(0, q.offset ?? 0);

  const rows = db
    .prepare(`SELECT * FROM cards ${whereSql} ORDER BY id DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit, offset }) as CardRecord[];
  const total = db.prepare(`SELECT COUNT(*) as c FROM cards ${whereSql}`).get(params) as { c: number };
  db.close();
  return { rows, total: total.c };
}

function queryCardsChunked(q: CardQuery, indexPath: string) {
  const chunkInfo = getChunkInfo(indexPath);
  const where: string[] = [];
  const params: Record<string, unknown> = {};

  if (q.country) { where.push('(country_code = @country OR country_name LIKE @countryLike)'); params.country = q.country; params.countryLike = `%${q.country}%`; }
  if (q.state) { where.push('(state_code = @state OR state_name LIKE @stateLike)'); params.state = q.state; params.stateLike = `%${q.state}%`; }
  if (q.cardNumber) { where.push('card_number LIKE @cardNumber'); params.cardNumber = `%${q.cardNumber}%`; }
  if (q.bankName) { where.push('bank_name LIKE @bankName'); params.bankName = `%${q.bankName}%`; }
  if (q.cardholder) { where.push('cardholder_name LIKE @cardholder'); params.cardholder = `%${q.cardholder}%`; }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = Math.max(1, Math.min(q.limit ?? 25, 200));
  const offset = Math.max(0, q.offset ?? 0);

  // Instead of loading all rows into memory, use a more efficient approach
  const allRows: CardRecord[] = [];
  let totalCount = 0;
  let currentOffset = 0;

  for (const chunkPath of chunkInfo.files) {
    if (!fs.existsSync(chunkPath)) continue;
    
    // Use direct database opener to avoid recursion
    const db = openDatabaseDirect(chunkPath);
    
    // Get count from this chunk
    const chunkCount = db.prepare(`SELECT COUNT(*) as c FROM cards ${whereSql}`).get(params) as { c: number };
    totalCount += chunkCount.c;
    
    // Only get rows if we need them for the current page
    if (currentOffset + chunkCount.c > offset && allRows.length < limit) {
      const chunkOffset = Math.max(0, offset - currentOffset);
      const chunkLimit = Math.min(limit - allRows.length, chunkCount.c - chunkOffset);
      
      if (chunkLimit > 0) {
        const chunkRows = db
          .prepare(`SELECT * FROM cards ${whereSql} ORDER BY id DESC LIMIT @chunkLimit OFFSET @chunkOffset`)
          .all({ ...params, chunkLimit, chunkOffset }) as CardRecord[];
        
        // Use concat instead of spread to avoid stack overflow
        for (const row of chunkRows) {
          allRows.push(row);
        }
      }
    }
    
    currentOffset += chunkCount.c;
    db.close();
    
    // Early exit if we have enough rows
    if (allRows.length >= limit) break;
  }

  // Sort the collected results
  allRows.sort((a, b) => b.id - a.id);

  return { rows: allRows.slice(0, limit), total: totalCount };
}

export function getDistinctValues(column: 'country_name' | 'state_name', filter?: { country?: string }, dbPath?: string): string[] {
  const resolvedPath = dbPath || resolveDbPath();
  
  if (isChunkedMode(resolvedPath)) {
    return getDistinctValuesChunked(column, filter, resolvedPath);
  }
  
  // Single database mode
  const db = getDb(resolvedPath);
  let query = `SELECT DISTINCT ${column} FROM cards WHERE ${column} IS NOT NULL`;
  const params: Record<string, unknown> = {};
  
  if (filter?.country && column === 'state_name') {
    query += ' AND country_name = @country';
    params.country = filter.country;
  }
  
  query += ` ORDER BY ${column}`;
  
  const results = db.prepare(query).all(params) as Record<string, string>[];
  db.close();
  
  return results.map(r => r[column]);
}

function getDistinctValuesChunked(column: 'country_name' | 'state_name', filter?: { country?: string }, indexPath?: string): string[] {
  const chunkInfo = getChunkInfo(indexPath!);
  const allValues = new Set<string>();
  
  for (const chunkPath of chunkInfo.files) {
    if (!fs.existsSync(chunkPath)) continue;
    
    // Use direct database opener to avoid recursion
    const db = openDatabaseDirect(chunkPath);
    let query = `SELECT DISTINCT ${column} FROM cards WHERE ${column} IS NOT NULL`;
    const params: Record<string, unknown> = {};
    
    if (filter?.country && column === 'state_name') {
      query += ' AND country_name = @country';
      params.country = filter.country;
    }
    
    const results = db.prepare(query).all(params) as Record<string, string>[];
    results.forEach(r => allValues.add(r[column]));
    
    db.close();
  }
  
  return Array.from(allValues).sort();
}


