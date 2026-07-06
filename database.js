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
      override_status TEXT,
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
      address TEXT,
      ward TEXT,
      aadhaar TEXT,
      username TEXT UNIQUE,
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
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      citizen_name TEXT,
      tax_status TEXT,
      error_message TEXT
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
      admin_remarks TEXT,
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
      target_criteria TEXT NOT NULL,
      eligibility_criteria TEXT,
      required_documents TEXT,
      benefits TEXT,
      application_process TEXT,
      contact_details TEXT
    )
  `);

  // Appointments table (NEW)
  db.run(`
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id TEXT NOT NULL,
      tax_record_id INTEGER NOT NULL,
      appointment_date DATE NOT NULL,
      appointment_time TEXT NOT NULL,
      status TEXT DEFAULT 'Pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (property_id) REFERENCES properties(property_id),
      FOREIGN KEY (tax_record_id) REFERENCES tax_records(id)
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
    { name: 'disability', type: "INTEGER DEFAULT 0" },
    { name: 'address', type: "TEXT" },
    { name: 'ward', type: "TEXT" },
    { name: 'aadhaar', type: "TEXT" },
    { name: 'username', type: "TEXT" }
  ];
  userCols.forEach(col => {
    try {
      db.run(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type}`);
    } catch(e) {}
  });

  try {
    db.run("ALTER TABLE complaints ADD COLUMN admin_remarks TEXT");
  } catch(e) {}

  try {
    db.run("ALTER TABLE sms_logs ADD COLUMN citizen_name TEXT");
  } catch(e) {}

  try {
    db.run("ALTER TABLE sms_logs ADD COLUMN tax_status TEXT");
  } catch(e) {}

  try {
    db.run("ALTER TABLE sms_logs ADD COLUMN error_message TEXT");
  } catch(e) {}

  try {
    db.run("ALTER TABLE tax_records ADD COLUMN override_status TEXT");
  } catch(e) {}

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

  // Schemes column migrations
  const schemeCols = [
    { name: 'eligibility_criteria', type: 'TEXT' },
    { name: 'required_documents', type: 'TEXT' },
    { name: 'benefits', type: 'TEXT' },
    { name: 'application_process', type: 'TEXT' },
    { name: 'contact_details', type: 'TEXT' }
  ];
  schemeCols.forEach(col => {
    try {
      db.run(`ALTER TABLE government_schemes ADD COLUMN ${col.name} ${col.type}`);
    } catch(e) {}
  });

  // Services column migrations
  const serviceCols = [
    { name: 'required_documents', type: 'TEXT' },
    { name: 'processing_time', type: 'TEXT' },
    { name: 'office_timings', type: 'TEXT' },
    { name: 'contact_details', type: 'TEXT' }
  ];
  serviceCols.forEach(col => {
    try {
      db.run(`ALTER TABLE services ADD COLUMN ${col.name} ${col.type}`);
    } catch(e) {}
  });

  // Retroactively update existing schemes with details if they exist
  try {
    db.run(`UPDATE government_schemes SET 
      eligibility_criteria = 'Landholding farmer families with cultivable land holding up to 2 hectares in their name.',
      required_documents = 'Aadhaar Card, Land Ownership Documents (Pattadar Passbook), Bank Account Details, Mobile Number.',
      benefits = 'Direct income support of ₹6,000 per year in three equal installments of ₹2,000 every four months.',
      application_process = 'Apply online via PM-Kisan Portal (pmkisan.gov.in) or visit the local Gram Panchayat Common Service Center (CSC).',
      contact_details = 'Panchayat Agriculture Officer (Contact: 080-28431101, Email: ao-agri@grampanchayat.gov.in)'
      WHERE title = 'PM Kisan'`);
    
    db.run(`UPDATE government_schemes SET 
      eligibility_criteria = 'Families residing in rural areas who do not own a pucca house, with annual income below ₹1.5 Lakhs.',
      required_documents = 'Aadhaar Card, Job Card Number, Bank Passbook, Certificate of Land Ownership/No-Land Certificate.',
      benefits = 'Financial assistance of ₹1.2 Lakhs in plains and ₹1.3 Lakhs in hilly/difficult areas for constructing a house.',
      application_process = 'Identify yourself in the Socio-Economic Caste Census (SECC) list, or fill registration form at the Panchayat Office.',
      contact_details = 'Panchayat Development Officer (PDO) (Contact: 080-28431102, Email: pdo@grampanchayat.gov.in)'
      WHERE title = 'PM Awas Yojana'`);

    db.run(`UPDATE government_schemes SET 
      eligibility_criteria = 'All adult members of a rural household willing to do unskilled manual work.',
      required_documents = 'Aadhaar Card, Age Proof, Passport size photo, Bank Account details (linked to Aadhaar).',
      benefits = 'Guaranteed 100 days of wage employment in a financial year to a rural household.',
      application_process = 'Apply for a Job Card at the local Gram Panchayat. Work is allocated within 15 days of demand.',
      contact_details = 'MGNREGA Helpdesk at Gram Panchayat Office (Contact: 080-28431103, Email: mgnrega@grampanchayat.gov.in)'
      WHERE title = 'MGNREGA'`);

    db.run(`UPDATE government_schemes SET 
      eligibility_criteria = 'Rural students pursuing post-matriculation courses, with family annual income less than ₹2.5 Lakhs.',
      required_documents = 'Income Certificate, Caste Certificate, Previous Year Marks card, Bank Account details, Fee Receipt.',
      benefits = 'Tuition fee reimbursement and monthly maintenance allowance depending on course type.',
      application_process = 'Apply online through State Scholarship Portal (SSP) or submit documents at the Panchayat School Office.',
      contact_details = 'Panchayat Education Coordinator (Contact: 080-28431104, Email: edu@grampanchayat.gov.in)'
      WHERE title = 'Post-Matric Scholarship'`);

    db.run(`UPDATE government_schemes SET 
      eligibility_criteria = 'Citizens with 40% or more disability, residing in rural areas with annual income below ₹1.2 Lakhs.',
      required_documents = 'Disability Certificate from Medical Board, Aadhaar Card, Income Certificate, Bank Account details.',
      benefits = 'Monthly pension of ₹1,000 directly transferred to the beneficiary''s bank account.',
      application_process = 'Submit physical application form signed by Panchayat PDO along with medical certificate.',
      contact_details = 'Social Welfare Inspector (Contact: 080-28431105, Email: welfare@grampanchayat.gov.in)'
      WHERE title = 'Divyangjan Pension'`);
  } catch (err) {
    console.error("Error migrating scheme details:", err.message);
  }

  // Retroactively update existing services with details
  try {
    db.run(`UPDATE services SET 
      required_documents = 'Hospital birth registration slip, Parent''s ID proof (Aadhaar/Voter ID), Marriage certificate.',
      processing_time = '7 Working Days',
      office_timings = '10:00 AM to 02:00 PM (Monday to Friday)',
      contact_details = 'Panchayat Registrar (Births & Deaths) - Contact: 080-28431110'
      WHERE title = 'Birth Certificate'`);

    db.run(`UPDATE services SET 
      required_documents = 'Hospital death report or cremation/burial certificate, Identity proof of the deceased.',
      processing_time = '5 Working Days',
      office_timings = '10:00 AM to 02:00 PM (Monday to Friday)',
      contact_details = 'Panchayat Registrar (Births & Deaths) - Contact: 080-28431110'
      WHERE title = 'Death Certificate'`);

    db.run(`UPDATE services SET 
      required_documents = 'Marriage invitation card, Marriage photograph, Age proof, Address proof of bride/groom, 3 witnesses.',
      processing_time = '15 Working Days',
      office_timings = '10:00 AM to 04:00 PM (Monday to Friday)',
      contact_details = 'Panchayat Marriage Officer - Contact: 080-28431111'
      WHERE title = 'Marriage Certificate'`);

    db.run(`UPDATE services SET 
      required_documents = 'Property tax paid receipt, Address proof, Ownership document, Plumbing blueprint.',
      processing_time = '10 Working Days',
      office_timings = '10:00 AM to 01:00 PM (Monday to Friday)',
      contact_details = 'Panchayat Water Department Engineer - Contact: 080-28431112'
      WHERE title = 'Water Connection'`);

    db.run(`UPDATE services SET 
      required_documents = 'Property tax receipt, Land conversion certificate, Building blueprint certified by licensed architect.',
      processing_time = '30 Working Days',
      office_timings = '10:00 AM to 04:00 PM (Monday to Friday)',
      contact_details = 'Panchayat Assistant Executive Engineer - Contact: 080-28431113'
      WHERE title = 'Building Permission'`);

    db.run(`UPDATE services SET 
      required_documents = 'No Objection Certificate (NOC) from fire & police, Proof of business location, Rent agreement.',
      processing_time = '20 Working Days',
      office_timings = '11:00 AM to 04:00 PM (Monday to Friday)',
      contact_details = 'PDO Trade Section - Contact: 080-28431114'
      WHERE title = 'Trade License'`);

    db.run(`UPDATE services SET 
      required_documents = 'Written application signed by at least 5 residents of the ward, Photos of damaged road.',
      processing_time = '15 Working Days',
      office_timings = '10:00 AM to 05:00 PM (Monday to Saturday)',
      contact_details = 'Panchayat Public Works Division - Contact: 080-28431115'
      WHERE title = 'Road Repair'`);

    db.run(`UPDATE services SET 
      required_documents = 'Ward number, pole number (if visible), description of issue.',
      processing_time = '3 Working Days',
      office_timings = '09:00 AM to 06:00 PM (Monday to Saturday)',
      contact_details = 'Panchayat Electrical Maintenance Cell - Contact: 080-28431116'
      WHERE title = 'Street Light'`);
  } catch (err) {
    console.error("Error migrating service details:", err.message);
  }

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
      ['PROP001', 'Ramesh Kumar', '9876543210', 'ramesh@example.com', 'user123', 45, 'Male', 'Agriculture', 75000.0, 2.5, 1, 0, 0, 'Village Main Road, Block A', 'Ward 1', '123456789012', 'ramesh'],
      ['PROP002', 'Lakshmi Devi', '9876543211', 'lakshmi@example.com', 'user123', 38, 'Female', 'Laborer', 48000.0, 0.2, 0, 0, 0, 'Near Temple Road, Block B', 'Ward 2', '223456789012', 'lakshmi'],
      ['PROP003', 'Suresh Reddy', '9876543212', 'suresh@example.com', 'user123', 62, 'Male', 'Business', 240000.0, 1.2, 0, 0, 1, 'Market Street, Block C', 'Ward 3', '323456789012', 'suresh'],
      ['PROP004', 'Kamala Devi', '9876543213', 'kamala@example.com', 'user123', 21, 'Female', 'Student', 35000.0, 0.0, 0, 1, 0, 'School Road, Block A', 'Ward 1', '423456789012', 'kamala']
    ];
    users.forEach(u => {
      db.run('INSERT INTO users (property_id, name, phone, email, password, age, gender, occupation, income, land_size, is_farmer, is_student, disability, address, ward, aadhaar, username) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', u);
    });
  }

  // Force update seeded usernames in case database already exists
  try {
    db.run("UPDATE users SET username = 'ramesh', address = 'Village Main Road, Block A', ward = 'Ward 1', aadhaar = '123456789012' WHERE property_id = 'PROP001' AND (username IS NULL OR username = '')");
    db.run("UPDATE users SET username = 'lakshmi', address = 'Near Temple Road, Block B', ward = 'Ward 2', aadhaar = '223456789012' WHERE property_id = 'PROP002' AND (username IS NULL OR username = '')");
    db.run("UPDATE users SET username = 'suresh', address = 'Market Street, Block C', ward = 'Ward 3', aadhaar = '323456789012' WHERE property_id = 'PROP003' AND (username IS NULL OR username = '')");
    db.run("UPDATE users SET username = 'kamala', address = 'School Road, Block A', ward = 'Ward 1', aadhaar = '423456789012' WHERE property_id = 'PROP004' AND (username IS NULL OR username = '')");
  } catch(e) {}

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
