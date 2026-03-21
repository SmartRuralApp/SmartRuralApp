const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'panchayat.db');

// Ensure data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db = null;

// Initialize database
async function initDatabase() {
  const SQL = await initSqlJs();
  
  // Load existing database or create new one
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }
  
  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id TEXT UNIQUE NOT NULL,
      owner_name TEXT NOT NULL,
      address TEXT,
      property_type TEXT DEFAULT 'Residential',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS tax_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id TEXT NOT NULL,
      tax_amount REAL NOT NULL,
      due_date DATE NOT NULL,
      year INTEGER NOT NULL,
      status TEXT DEFAULT 'Unpaid',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (property_id) REFERENCES properties(property_id)
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id TEXT NOT NULL,
      tax_record_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      payment_method TEXT DEFAULT 'Online',
      transaction_id TEXT UNIQUE,
      FOREIGN KEY (property_id) REFERENCES properties(property_id),
      FOREIGN KEY (tax_record_id) REFERENCES tax_records(id)
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      icon TEXT DEFAULT 'fa-cogs',
      status TEXT DEFAULT 'Active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id TEXT NOT NULL,
      tax_record_id INTEGER NOT NULL,
      reminder_type TEXT NOT NULL,
      reminder_days INTEGER NOT NULL,
      reminder_date DATE NOT NULL,
      sent INTEGER DEFAULT 0,
      sent_date DATETIME,
      sms_sent INTEGER DEFAULT 0,
      FOREIGN KEY (property_id) REFERENCES properties(property_id),
      FOREIGN KEY (tax_record_id) REFERENCES tax_records(id)
    )
  `);
  
  // User/citizen login table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id TEXT UNIQUE,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (property_id) REFERENCES properties(property_id)
    )
  `);
  
  // SMS log table
  db.run(`
    CREATE TABLE IF NOT EXISTS sms_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id TEXT NOT NULL,
      phone TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT DEFAULT 'Sent',
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Check if we need to insert sample data
  const result = db.exec('SELECT COUNT(*) as count FROM properties');
  const propertyCount = result.length > 0 ? result[0].values[0][0] : 0;
  
  if (propertyCount === 0) {
    console.log('Inserting sample data...');
    
    // Insert admin user
    db.run('INSERT INTO admin_users (username, password) VALUES (?, ?)', ['admin', 'admin123']);
    
    // Insert sample properties
    const properties = [
      ['PROP001', 'Ramesh Kumar', 'Village Main Road, Block A', 'Residential'],
      ['PROP002', '', 'Near TempleLakshmi Devi Road, Block B', 'Residential'],
      ['PROP003', 'Suresh Reddy', 'Market Street, Block C', 'Commercial'],
      ['PROP004', 'Kamala Devi', 'School Road, Block A', 'Residential'],
      ['PROP005', 'Mohan Lal', 'Bus Stand Road, Block D', 'Commercial']
    ];
    
    properties.forEach(prop => {
      db.run('INSERT INTO properties (property_id, owner_name, address, property_type) VALUES (?, ?, ?, ?)', prop);
    });
    
    // Insert sample tax records
    const currentYear = new Date().getFullYear();
    const taxRecords = [
      ['PROP001', 2500, `${currentYear}-03-31`, currentYear, 'Paid'],
      ['PROP002', 1800, `${currentYear}-03-31`, currentYear, 'Unpaid'],
      ['PROP003', 5000, `${currentYear}-03-31`, currentYear, 'Paid'],
      ['PROP004', 2200, `${currentYear}-03-31`, currentYear, 'Unpaid'],
      ['PROP005', 4500, `${currentYear}-06-30`, currentYear, 'Unpaid']
    ];
    
    taxRecords.forEach(tax => {
      db.run('INSERT INTO tax_records (property_id, tax_amount, due_date, year, status) VALUES (?, ?, ?, ?, ?)', tax);
    });
    
    // Insert sample payments
    db.run('INSERT INTO payments (property_id, tax_record_id, amount, payment_method, transaction_id) VALUES (?, ?, ?, ?, ?)', 
      ['PROP001', 1, 2500, 'Online', 'TXN001']);
    db.run('INSERT INTO payments (property_id, tax_record_id, amount, payment_method, transaction_id) VALUES (?, ?, ?, ?, ?)', 
      ['PROP003', 3, 5000, 'Online', 'TXN002']);
    
    // Insert sample services
    const services = [
      ['Birth Certificate', 'Apply for new birth certificate', 'fa-baby', 'Active'],
      ['Death Certificate', 'Apply for death certificate', 'fa-certificate', 'Active'],
      ['Marriage Certificate', 'Apply for marriage certificate', 'fa-ring', 'Active'],
      ['Water Connection', 'Apply for new water connection', 'fa-tint', 'Active'],
      ['Building Permission', 'Apply for building construction permission', 'fa-home', 'Active'],
      ['Trade License', 'Apply for trade/business license', 'fa-briefcase', 'Inactive'],
      ['Road Repair', 'Report road maintenance issues', 'fa-road', 'Active'],
      ['Street Light', 'Report street light issues', 'fa-lightbulb', 'Active']
    ];
    
    services.forEach(service => {
      db.run('INSERT INTO services (title, description, icon, status) VALUES (?, ?, ?, ?)', service);
    });
    
    saveDatabase();
    console.log('Sample data inserted successfully!');
  }
  
  return db;
}

// Save database to file
function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

// Helper functions to match better-sqlite3 API

function prepare(sql) {
  return {
    all: function(...params) {
      try {
        console.log('SQL:', sql, params);
        const stmt = db.prepare(sql);
        const result = stmt.getAsObject(...params);
        stmt.free();
        if (!result) return [];
        return [result];
      } catch (e) {
        console.error('SQL Error:', e.message, sql, params);
        return [];
      }
    },
    get: function(...params) {
      try {
        console.log('SQL GET:', sql, params);
        const stmt = db.prepare(sql);
        const result = stmt.getAsObject(...params);
        stmt.free();
        return result || null;
      } catch (e) {
        console.error('SQL Error:', e.message, sql, params);
        return null;
      }
    },
    run: function(...params) {
      try {
        console.log('SQL RUN:', sql, params);
        const stmt = db.prepare(sql);
        stmt.run(...params);
        stmt.free();
        saveDatabase();
        return { changes: 1 };
      } catch (e) {
        console.error('SQL Error:', e.message, sql, params);
        throw e;
      }
    }
  };
}


// Export initialization and database access
module.exports = {
  init: initDatabase,
  prepare: prepare,
  getDb: () => db
};

