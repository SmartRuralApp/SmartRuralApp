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
      predicted_status TEXT DEFAULT 'Low Risk',
      payment_probability REAL DEFAULT 100.0,
      admin_corrected INTEGER DEFAULT 0,
      xai_explanation TEXT,
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
      age INTEGER DEFAULT 30,
      gender TEXT DEFAULT 'Male',
      occupation TEXT DEFAULT 'Agriculture',
      income REAL DEFAULT 80000.0,
      land_size REAL DEFAULT 1.5,
      is_farmer INTEGER DEFAULT 1,
      is_student INTEGER DEFAULT 0,
      disability INTEGER DEFAULT 0,
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

  // Complaints table (NEW)
  db.run(`
    CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      ward TEXT NOT NULL,
      priority TEXT,
      predicted_priority TEXT,
      predicted_category TEXT,
      confidence_score REAL,
      status TEXT DEFAULT 'Pending',
      is_duplicate INTEGER DEFAULT 0,
      duplicate_of_id INTEGER,
      admin_corrected INTEGER DEFAULT 0,
      xai_explanation TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (property_id) REFERENCES properties(property_id)
    )
  `);

  // Notifications table (NEW)
  db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      role TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL,
      read_status INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Government Schemes table (NEW)
  db.run(`
    CREATE TABLE IF NOT EXISTS government_schemes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT UNIQUE NOT NULL,
      description TEXT NOT NULL,
      target_criteria TEXT NOT NULL
    )
  `);

  // Run migrations in case database already exists
  const taxCols = [
    { name: 'predicted_status', type: "TEXT DEFAULT 'Low Risk'" },
    { name: 'payment_probability', type: "REAL DEFAULT 100.0" },
    { name: 'admin_corrected', type: "INTEGER DEFAULT 0" },
    { name: 'xai_explanation', type: "TEXT" }
  ];
  taxCols.forEach(col => {
    try {
      db.run(`ALTER TABLE tax_records ADD COLUMN ${col.name} ${col.type}`);
    } catch(e) {}
  });

  const userCols = [
    { name: 'age', type: "INTEGER DEFAULT 30" },
    { name: 'gender', type: "TEXT DEFAULT 'Male'" },
    { name: 'occupation', type: "TEXT DEFAULT 'Agriculture'" },
    { name: 'income', type: "REAL DEFAULT 80000.0" },
    { name: 'land_size', type: "REAL DEFAULT 1.5" },
    { name: 'is_farmer', type: "INTEGER DEFAULT 1" },
    { name: 'is_student', type: "INTEGER DEFAULT 0" },
    { name: 'disability', type: "INTEGER DEFAULT 0" }
  ];
  userCols.forEach(col => {
    try {
      db.run(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type}`);
    } catch(e) {}
  });

  const remindersCols = [
    { name: 'sent', type: "INTEGER DEFAULT 0" },
    { name: 'sent_date', type: "DATETIME" },
    { name: 'sms_sent', type: "INTEGER DEFAULT 0" }
  ];
  remindersCols.forEach(col => {
    try {
      db.run(`ALTER TABLE reminders ADD COLUMN ${col.name} ${col.type}`);
    } catch(e) {}
  });

  // 1. Seed admin user if missing
  const adminCheck = db.exec('SELECT COUNT(*) as count FROM admin_users');
  const adminCount = adminCheck.length > 0 ? adminCheck[0].values[0][0] : 0;
  if (adminCount === 0) {
    db.run("INSERT INTO admin_users (username, password) VALUES ('admin', 'admin123')");
  }

  // 2. Seed properties if missing
  const propCheck = db.exec('SELECT COUNT(*) as count FROM properties');
  const propCount = propCheck.length > 0 ? propCheck[0].values[0][0] : 0;
  if (propCount === 0) {
    console.log('Seeding sample properties...');
    const properties = [
      ['PROP001', 'Ramesh Kumar', 'Village Main Road, Block A', 'Residential'],
      ['PROP002', 'Lakshmi Devi', 'Near Temple Road, Block B', 'Residential'],
      ['PROP003', 'Suresh Reddy', 'Market Street, Block C', 'Commercial'],
      ['PROP004', 'Kamala Devi', 'School Road, Block A', 'Residential'],
      ['PROP005', 'Mohan Lal', 'Bus Stand Road, Block D', 'Commercial']
    ];
    properties.forEach(prop => {
      db.run('INSERT INTO properties (property_id, owner_name, address, property_type) VALUES (?, ?, ?, ?)', prop);
    });
  }

  // 3. Seed tax records if missing
  const taxCheck = db.exec('SELECT COUNT(*) as count FROM tax_records');
  const taxCount = taxCheck.length > 0 ? taxCheck[0].values[0][0] : 0;
  if (taxCount === 0) {
    console.log('Seeding sample tax records...');
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

    db.run("INSERT INTO payments (property_id, tax_record_id, amount, transaction_id) VALUES ('PROP001', 1, 2500, 'TXN001')");
    db.run("INSERT INTO payments (property_id, tax_record_id, amount, transaction_id) VALUES ('PROP003', 3, 5000, 'TXN002')");
  }

  // 4. Seed services if missing
  const serviceCheck = db.exec('SELECT COUNT(*) as count FROM services');
  const serviceCount = serviceCheck.length > 0 ? serviceCheck[0].values[0][0] : 0;
  if (serviceCount === 0) {
    console.log('Seeding sample services...');
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
  }

  // 5. Seed schemes if missing
  const schemeCheck = db.exec('SELECT COUNT(*) as count FROM government_schemes');
  const schemeCount = schemeCheck.length > 0 ? schemeCheck[0].values[0][0] : 0;
  if (schemeCount === 0) {
    console.log('Seeding sample government schemes...');
    const schemes = [
      ['PM Kisan', 'Financial benefit of ₹6,000 per year to landholding farmer families.', 'Farmer Status = 1, Land Size > 0, Occupation = Agriculture'],
      ['PM Awas Yojana', 'Welfare program to provide housing for the rural poor with household income below ₹1.5 Lakhs.', 'Income < 150000, Land Size < 0.5'],
      ['MGNREGA', 'Welfare measure guaranteeing 100 days of employment to rural household adults.', 'Occupation = Laborer or Income < 100000'],
      ['Post-Matric Scholarship', 'Financial assistance to rural students pursuing post-matriculation courses.', 'Student Status = 1, Income < 200000, Age < 25'],
      ['Divyangjan Pension', 'Pension scheme providing monthly financial assistance of ₹1,000 to disabled citizens.', 'Disability Status = 1, Income < 120000']
    ];
    schemes.forEach(s => {
      db.run('INSERT INTO government_schemes (title, description, target_criteria) VALUES (?, ?, ?)', s);
    });
  }

  // 6. Seed users (citizens) if missing
  const userCheck = db.exec('SELECT COUNT(*) as count FROM users');
  const userCount = userCheck.length > 0 ? userCheck[0].values[0][0] : 0;
  if (userCount === 0) {
    console.log('Seeding sample citizen users...');
    const users = [
      ['PROP001', 'Ramesh Kumar', '9876543210', 'ramesh@example.com', 'user123', 45, 'Male', 'Agriculture', 75000.0, 2.5, 1, 0, 0],
      ['PROP002', 'Lakshmi Devi', '9876543211', 'lakshmi@example.com', 'user123', 38, 'Female', 'Laborer', 48000.0, 0.2, 0, 0, 0],
      ['PROP003', 'Suresh Reddy', '9876543212', 'suresh@example.com', 'user123', 62, 'Male', 'Business', 240000.0, 1.2, 0, 0, 1],
      ['PROP004', 'Kamala Devi', '9876543213', 'kamala@example.com', 'user123', 21, 'Female', 'Student', 35000.0, 0.0, 0, 1, 0]
    ];
    users.forEach(u => {
      db.run('INSERT INTO users (property_id, name, phone, email, password, age, gender, occupation, income, land_size, is_farmer, is_student, disability) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', u);
    });
  }

  saveDatabase();
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
        const boundParams = (params.length === 1 && Array.isArray(params[0])) ? params[0] : params;
        console.log('SQL ALL:', sql, boundParams);
        const stmt = db.prepare(sql);
        stmt.bind(boundParams);
        const results = [];
        while (stmt.step()) {
          results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
      } catch (e) {
        console.error('SQL Error:', e.message, sql, params);
        return [];
      }
    },
    get: function(...params) {
      try {
        const boundParams = (params.length === 1 && Array.isArray(params[0])) ? params[0] : params;
        console.log('SQL GET:', sql, boundParams);
        const stmt = db.prepare(sql);
        const result = stmt.getAsObject(boundParams);
        stmt.free();
        const hasData = result && Object.keys(result).length > 0 && Object.values(result).some(v => v !== undefined);
        return hasData ? result : null;
      } catch (e) {
        console.error('SQL Error:', e.message, sql, params);
        return null;
      }
    },
    run: function(...params) {
      try {
        const boundParams = (params.length === 1 && Array.isArray(params[0])) ? params[0] : params;
        console.log('SQL RUN:', sql, boundParams);
        const stmt = db.prepare(sql);
        stmt.run(boundParams);
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
