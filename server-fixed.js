const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const PORT = 3000;

const db = new Database('./data/panchayat-fixed.db');
db.pragma('foreign_keys = ON');

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'panchayat-fixed',
  resave: false,
  saveUninitialized: true
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id TEXT UNIQUE NOT NULL,
    owner_name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tax_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id TEXT NOT NULL,
    tax_amount REAL NOT NULL,
    due_date DATE NOT NULL,
    year INTEGER NOT NULL,
    status TEXT DEFAULT 'Unpaid',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (property_id) REFERENCES properties (property_id)
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id TEXT NOT NULL,
    tax_record_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    transaction_id TEXT UNIQUE
  );

  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'Active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  )
`);

db.exec(`INSERT OR IGNORE INTO admin_users (username, password) VALUES ('admin', 'admin123')`);

// Sample data
db.exec(`
  INSERT OR IGNORE INTO properties (property_id, owner_name, address, phone) VALUES 
  ('PROP001', 'Ramesh Kumar', 'Village Road', '9876543210'),
  ('PROP002', 'Lakshmi Devi', 'Temple Road', '9876543211'),
  ('PROP003', 'Suresh Reddy', 'Market Street', '9876543212')
`);

db.exec(`
  INSERT OR IGNORE INTO tax_records (property_id, tax_amount, due_date, year, status) VALUES 
  ('PROP001', 2500, '2026-03-31', 2026, 'Paid'),
  ('PROP002', 1800, '2026-03-31', 2026, 'Unpaid'),
  ('PROP003', 5000, '2026-03-31', 2026, 'Unpaid')
`);

db.exec(`
  INSERT OR IGNORE INTO services (title, description) VALUES 
  ('Birth Certificate', 'Birth certificate issuance'),
  ('Death Certificate', 'Death certificate issuance'),
  ('Marriage Registration', 'Marriage registration services'),
  ('Water Connection', 'Water supply connection')
`);

// Routes
app.get('/', (req, res) => {
  const stats = {
    properties: db.prepare('SELECT COUNT(*) as count FROM properties').get().count,
    unpaidTaxes: db.prepare("SELECT COUNT(*) as count FROM tax_records WHERE status = 'Unpaid'").get().count,
    totalCollection: db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM payments').get().total
  };
  
  res.render('index', { stats });
});

app.get('/tax-search', (req, res) => res.render('tax-search'));

app.post('/api/search-tax', (req, res) => {
  const { query } = req.body;
  const results = db.prepare(`
    SELECT tr.*, p.owner_name, p.address, p.phone FROM tax_records tr
    JOIN properties p ON tr.property_id = p.property_id
    WHERE tr.property_id LIKE ? OR p.owner_name LIKE ?
  `).all(`%${query}%`, `%${query}%`);
  res.json(results);
});

app.post('/api/pay-tax', (req, res) => {
  const { propertyId, taxId, amount } = req.body;
  const txnId = 'TXN' + Date.now();
  db.prepare('UPDATE tax_records SET status = "Paid" WHERE id = ?').run(taxId);
  db.prepare('INSERT INTO payments (property_id, tax_record_id, amount, transaction_id) VALUES (?, ?, ?, ?)').run(propertyId, taxId, amount, txnId);
  res.json({ success: true, txnId });
});

app.get('/services', (req, res) => {
  const services = db.prepare('SELECT * FROM services').all();
  res.render('services', { services });
});

app.get('/admin-login', (req, res) => res.render('admin-login', { error: null }));
app.post('/admin-login', (req, res) => {
  if (req.body.username === 'admin' && req.body.password === 'admin123') {
    req.session.admin = true;
    res.redirect('/admin-dashboard');
  } else {
    res.render('admin-login', { error: 'Invalid credentials' });
  }
});


app.use('/admin-*', (req, res, next) => {
  if (!req.session.admin) return res.redirect('/admin-login');
  next();
});

app.get('/admin-dashboard', (req, res) => {
  const stats = {
    properties: db.prepare('SELECT COUNT(*) as count FROM properties').get().count,
    unpaidTaxes: db.prepare("SELECT COUNT(*) as count FROM tax_records WHERE status = 'Unpaid'").get().count,
    totalCollection: db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM payments').get().total
  };
  stats.recentPayments = [];
  try {
    stats.recentPayments = db.prepare('SELECT p.*, t.property_id FROM payments p JOIN tax_records t ON p.tax_record_id = t.id ORDER BY p.payment_date DESC LIMIT 5').all();
  } catch (e) {
    stats.recentPayments = [];
  }
  res.render('admin-dashboard', { stats });
});


app.get('/admin-tax', (req, res) => {
  const taxRecords = db.prepare(`
    SELECT tr.*, p.owner_name, p.phone FROM tax_records tr 
    JOIN properties p ON tr.property_id = p.property_id
  `).all();
  res.render('admin-tax', { taxRecords });
});

app.post('/api/admin/add-tax', (req, res) => {
  const { propertyId, ownerName, phone, taxAmount, dueDate, year } = req.body;
  try {
    db.prepare('INSERT OR IGNORE INTO properties (property_id, owner_name, phone) VALUES (?, ?, ?)').run(propertyId, ownerName, phone);
    db.prepare('INSERT INTO tax_records (property_id, tax_amount, due_date, year) VALUES (?, ?, ?, ?)').run(propertyId, taxAmount, dueDate, year);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

