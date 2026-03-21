const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'panchayat-secret-key-2024',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Helper function to generate transaction ID
function generateTransactionId() {
  return 'TXN' + Date.now() + Math.floor(Math.random() * 1000);
}

// ==================== PUBLIC ROUTES ====================

// Home page - SAFE VERSION (no reminders on load)
app.get('/', (req, res) => {
  const totalCollection = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM payments
  `).get();

  const pendingCount = db.prepare(`
    SELECT COUNT(*) as count FROM tax_records WHERE status = 'Unpaid'
  `).get();

  const totalProperties = db.prepare(`
    SELECT COUNT(*) as count FROM properties
  `).get();


  res.render('index', {
    reminders: [],
    stats: {
      collection: totalCollection?.total || 0,
      pending: pendingCount?.count || 0,
      properties: totalProperties?.count || 0
    },
    session: req.session
  });

});

// Tax search page
app.get('/tax-search', (req, res) => {
  res.render('tax-search', { session: req.session });
});

// Search tax records
app.post('/api/search-tax', (req, res) => {
  const { searchType, searchValue } = req.body;
  
  let query = '';
  let params = [];

  if (searchType === 'propertyId') {
    query = `
      SELECT tr.*, p.owner_name, p.address, p.property_type
      FROM tax_records tr
      JOIN properties p ON tr.property_id = p.property_id
      WHERE tr.property_id = ?
    `;
    params = [searchValue.toUpperCase()];
  } else {
    query = `
      SELECT tr.*, p.owner_name, p.address, p.property_type
      FROM tax_records tr
      JOIN properties p ON tr.property_id = p.property_id
      WHERE p.owner_name LIKE ?
    `;
    params = [`%${searchValue}%`];
  }

  try {
    const results = db.prepare(query).all(...params);
    res.json({ success: true, data: results });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// Make payment
app.post('/api/make-payment', (req, res) => {
  const { propertyId, taxRecordId, amount } = req.body;
  const transactionId = generateTransactionId();

  try {
    // Update tax record status
    db.prepare(`
      UPDATE tax_records SET status = 'Paid' WHERE id = ?
    `).run(taxRecordId);

    // Insert payment record
    db.prepare(`
      INSERT INTO payments (property_id, tax_record_id, amount, payment_method, transaction_id)
      VALUES (?, ?, ?, 'Online', ?)
    `).run(propertyId, taxRecordId, amount, transactionId);

    res.json({ 
      success: true, 
      message: 'Payment successful!',
      transactionId 
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// Services page
app.get('/services', (req, res) => {
  const services = db.prepare('SELECT * FROM services ORDER BY created_at DESC').all();
  res.render('services', { services, session: req.session });
});

// Payment success page
app.get('/payment-success', (req, res) => {
  const { txnId, amount, propertyId } = req.query;
  res.render('payment-success', { 
    transactionId: txnId, 
    amount, 
    propertyId,
    session: req.session 
  });
});

// ==================== ADMIN ROUTES ====================

// Admin login page
app.get('/admin-login', (req, res) => {
  if (req.session.admin) {
    return res.redirect('/admin-dashboard');
  }
  res.render('admin-login', { session: req.session, error: null });
});

// Admin login handler
app.post('/admin-login', (req, res) => {
  const { username, password } = req.body;

  const admin = db.prepare(`
    SELECT * FROM admin_users WHERE username = ? AND password = ?
  `).get(username, password);

  if (admin) {
    req.session.admin = admin;
    res.redirect('/admin-dashboard');
  } else {
    res.render('admin-login', { 
      session: req.session, 
      error: 'Invalid username or password' 
    });
  }
});

// Admin logout
app.get('/admin-logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin-login');
});

// Admin middleware
function requireAdmin(req, res, next) {
  if (!req.session.admin) {
    return res.redirect('/admin-login');
  }
  next();
}

// Admin dashboard
app.get('/admin-dashboard', requireAdmin, (req, res) => {
  const totalCollection = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM payments
  `).get();

  const pendingCount = db.prepare(`
    SELECT COUNT(*) as count FROM tax_records WHERE status = 'Unpaid'
  `).get();

  const totalProperties = db.prepare(`
    SELECT COUNT(*) as count FROM properties
  `).get();

  const recentPayments = db.prepare(`
    SELECT pay.*, p.owner_name 
    FROM payments pay
    JOIN properties p ON pay.property_id = p.property_id
    ORDER BY pay.payment_date DESC LIMIT 10
  `).all();

  res.render('admin-dashboard', {
    session: req.session,
    stats: {
      collection: totalCollection ? totalCollection.total : 0,
      pending: pendingCount ? pendingCount.count : 0,
      properties: totalProperties ? totalProperties.count : 0
    },
    recentPayments
  });
});

// Admin tax management
app.get('/admin-tax', requireAdmin, (req, res) => {
  const taxRecords = db.prepare(`
    SELECT tr.*, p.owner_name, p.address
    FROM tax_records tr
    JOIN properties p ON tr.property_id = p.property_id
    ORDER BY tr.created_at DESC
  `).all();

  const properties = db.prepare('SELECT * FROM properties').all();

  res.render('admin-tax', { 
    session: req.session, 
    taxRecords,
    properties 
  });
});

// Add tax record
app.post('/api/admin/add-tax', requireAdmin, (req, res) => {
  const { propertyId, taxAmount, dueDate, year, ownerName } = req.body;
  
  console.log('Add tax request:', { propertyId, taxAmount, dueDate, year, ownerName });

  if (!propertyId || !taxAmount || !dueDate || !year) {
    return res.json({ success: false, message: 'All fields are required' });
  }

  try {
    // First check if property exists, if not create it
    let property = db.prepare('SELECT * FROM properties WHERE property_id = ?').get(propertyId);
    if (!property) {
      console.log('Creating property:', propertyId);
      db.prepare(`
        INSERT INTO properties (property_id, owner_name, address, property_type)
        VALUES (?, ?, ?, 'Residential')
      `).run(propertyId, ownerName || 'Citizen', 'Panchayat Area');
      console.log('Created new property:', propertyId);
    } else {
      console.log('Property exists:', propertyId);
    }
    
// SIMPLIFIED DIRECT INSERT - no complex string building
    const propertyIdSafe = propertyId.toString().replace(/'/g, \"''\");
    const directSql = `INSERT INTO tax_records (property_id, tax_amount, due_date, year, status) VALUES ('${propertyIdSafe}', ${taxAmount}, '${dueDate}', ${year}, 'Unpaid')`;
    console.log('SIMPLE DIRECT SQL:', directSql);
    db.prepare(directSql).run();
    console.log('Tax record inserted SUCCESSFULLY!');


    
    res.json({ success: true, message: 'Tax record saved successfully!' });
  } catch (error) {
    console.error('Add tax error:', error);
    res.json({ success: false, message: error.message });
  }
});

// Update tax record
app.post('/api/admin/update-tax', requireAdmin, (req, res) => {
  const { id, taxAmount, dueDate, year, status } = req.body;

  try {
    db.prepare(`
      UPDATE tax_records SET tax_amount = ?, due_date = ?, year = ?, status = ?
      WHERE id = ?
    `).run(taxAmount, dueDate, year, status, id);

    res.json({ success: true, message: 'Tax record updated successfully!' });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// Delete tax record
app.post('/api/admin/delete-tax', requireAdmin, (req, res) => {
  const { id } = req.body;

  try {
    db.prepare('DELETE FROM tax_records WHERE id = ?').run(id);
    res.json({ success: true, message: 'Tax record deleted successfully!' });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// Admin services management
app.get('/admin-services', requireAdmin, (req, res) => {
  const services = db.prepare('SELECT * FROM services ORDER BY created_at DESC').all();
  res.render('admin-services', { session: req.session, services });
});

// Add service
app.post('/api/admin/add-service', requireAdmin, (req, res) => {
  const { title, description, icon, status } = req.body;

  try {
    db.prepare(`
      INSERT INTO services (title, description, icon, status)
      VALUES (?, ?, ?, ?)
    `).run(title, description, icon || 'fa-cogs', status || 'Active');

    res.json({ success: true, message: 'Service added successfully!' });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// Update service
app.post('/api/admin/update-service', requireAdmin, (req, res) => {
  const { id, title, description, icon, status } = req.body;

  try {
    db.prepare(`
      UPDATE services SET title = ?, description = ?, icon = ?, status = ?
      WHERE id = ?
    `).run(title, description, icon, status, id);

    res.json({ success: true, message: 'Service updated successfully!' });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// Delete service
app.post('/api/admin/delete-service', requireAdmin, (req, res) => {
  const { id } = req.body;

  try {
    db.prepare('DELETE FROM services WHERE id = ?').run(id);
    res.json({ success: true, message: 'Service deleted successfully!' });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// Start server
db.init().then(() => {
  console.log('Database initialized successfully!');
  app.listen(PORT, () => {
    console.log(`Smart Grama Panchayat Management System running at http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
