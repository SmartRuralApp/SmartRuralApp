const path = require('path');
const fs = require('fs');

// Mock Vercel environment
process.env.VERCEL = '1';

// Clear DATABASE_PATH env if any, so fallback logic runs
delete process.env.DATABASE_PATH;

console.log('[TEST] Importing database module...');
const db = require('../database');

async function run() {
  try {
    console.log('[TEST] Initializing database (WASM)...');
    await db.init();
    
    console.log('[TEST] Checking active DB...');
    const rawDb = db.getDb();
    if (!rawDb) {
      throw new Error('Database instance is null!');
    }
    
    console.log('[TEST] Running sample query...');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log('[TEST] Found tables:', tables.map(t => t.name));
    
    const countCheck = db.prepare("SELECT COUNT(*) as count FROM properties").get();
    console.log('[TEST] Properties count:', countCheck.count);
    
    if (countCheck.count === 0) {
      throw new Error('Database is empty, seeding failed or file wasn\'t copied!');
    }
    
    console.log('[TEST] SUCCESS! Database was initialized, seeded/copied, and queried successfully under mocked Vercel environment.');
  } catch (err) {
    console.error('[TEST] FAILED:', err.stack);
    process.exit(1);
  }
}

run();
