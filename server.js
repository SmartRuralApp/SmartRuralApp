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

// Reminder intervals in days before due date
const REMINDER_INTERVALS = [30, 20, 15];

// Helper function to generate reminders for all intervals
function generateReminders() {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  // Get all unpaid tax records
  const unpaidTaxes = db.prepare(`
    SELECT tr.*, p.owner_name, p.address
    FROM tax_records tr
    JOIN properties p ON tr.property_id = p.property_id
    WHERE tr.status = 'Unpaid'
  `).all();

  let remindersCreated = 0;

  unpaidTaxes.forEach(tax => {
    const dueDate = new Date(tax.due_date);
    
    REMINDER_INTERVALS.forEach(daysBefore => {
      // Calculate reminder date (due date minus days)
      const reminderDate = new Date(dueDate);
      reminderDate.setDate(reminderDate.getDate() - daysBefore);
      const reminderDateStr = reminderDate.toISOString().split('T')[0];
      
      // Check if today is the reminder date or has passed (but not more than 1 day to avoid duplicates)
      const daysDiff = Math.ceil((reminderDate - today) / (1000 * 60 * 60 * 24));
      
      // If today is the reminder day or within 1 day after
      if (daysDiff <= 0 && daysDiff >= -1) {
        // Check if reminder already exists for this tax record and reminder type
        const existingReminder = db.prepare(`
          SELECT id FROM reminders 
          WHERE tax_record_id = ? AND reminder_days = ? AND sent = 0
        `).get(tax.id, daysBefore);

        if (!existingReminder) {
          // Create new reminder entry
          const reminderType = daysBefore + '_days_before';
          db.prepare(`
            INSERT INTO reminders (property_id, tax_record_id, reminder_type, reminder_days, reminder_date, sent)
            VALUES (?, ?, ?, ?, ?, 0)
          `).run(tax.property_id, tax.id, reminderType, daysBefore, reminderDateStr);
          remindersCreated++;
        }
      }
    });
  });

  if (remindersCreated > 0) {
    console.log('Created ' + remindersCreated + ' new reminder(s)');
  }
}

// Helper function to get active reminders for display
function getActiveReminders() {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Get reminders that should be shown (within reminder window)
  const reminders = db.prepare(`
    SELECT r.*, tr.tax_amount, tr.due_date, tr.year, p.owner_name, p.property_id
    FROM reminders r
    JOIN tax_records tr ON r.tax_record_id = tr.id
    JOIN properties p ON r.property_id = p.property_id
    WHERE r.sent = 0 
    AND tr.status = 'Unpaid'
    AND r.reminder_date <= ?
    ORDER BY r.reminder_days DESC, r.reminder_date ASC
  `).all(todayStr);

  return reminders;
}

// Helper function to mark reminder as sent
function markReminderSent(reminderId) {
  db.prepare(`
    UPDATE reminders SET sent = 1, sent_date = CURRENT_TIMESTAMP WHERE id = ?
  `).run(reminderId);
}

// ==================== PUBLIC ROUTES ====================

// Home page
app.get('/', (req, res) => {
  // Generate reminders on each page load
  generateReminders();
  
  // Get active reminders to display
  const reminders = getActiveReminders();
  
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
    reminders,
    stats: {
      collection: totalCollection ? totalCollection.total : 0,
      pending: pendingCount ? pendingCount.count : 0,
      properties: totalProperties ? totalProperties.count : 0
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
  const { propertyId, taxAmount, dueDate, year } = req.body;

  try {
    db.prepare(`
      INSERT INTO tax_records (property_id, tax_amount, due_date, year, status)
      VALUES (?, ?, ?, ?, 'Unpaid')
    `).run(propertyId, taxAmount, dueDate, year);

    res.json({ success: true, message: 'Tax record added successfully!' });
  } catch (error) {
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

// ==================== USER ROUTES ====================

// User registration
app.get('/register', (req, res) => {
  res.render('user-register', { session: req.session, error: null });
});

app.post('/api/user/register', (req, res) => {
  const { name, phone, email, password, propertyId } = req.body;
  
  try {
    // Check if user already exists
    const existingUser = db.prepare('SELECT id FROM users WHERE phone = ? OR property_id = ?').get(phone, propertyId);
    
    if (existingUser) {
      return res.json({ success: false, message: 'User already exists with this phone or property ID' });
    }
    
    db.prepare(`
      INSERT INTO users (name, phone, email, password, property_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, phone, email || '', password, propertyId || '');
    
    res.json({ success: true, message: 'Registration successful! Please login.' });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// User login
app.get('/user-login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/user-dashboard');
  }
  res.render('user-login', { session: req.session, error: null });
});

app.post('/user-login', (req, res) => {
  const { phone, password } = req.body;
  
  const user = db.prepare(`
    SELECT * FROM users WHERE phone = ? AND password = ?
  `).get(phone, password);
  
  if (user) {
    req.session.user = user;
    res.redirect('/user-dashboard');
  } else {
    res.render('user-login', { 
      session: req.session, 
      error: 'Invalid phone number or password' 
    });
  }
});

// User logout
app.get('/user-logout', (req, res) => {
  req.session.user = null;
  res.redirect('/user-login');
});

// User dashboard
app.get('/user-dashboard', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/user-login');
  }
  
  const user = req.session.user;
  
  // Get user's tax records
  const taxRecords = db.prepare(`
    SELECT tr.*, p.owner_name, p.address
    FROM tax_records tr
    JOIN properties p ON tr.property_id = p.property_id
    WHERE tr.property_id = ?
    ORDER BY tr.year DESC
  `).all(user.property_id || user.id);
  
  // Get pending taxes
  const pendingTaxes = db.prepare(`
    SELECT tr.*, p.owner_name
    FROM tax_records tr
    JOIN properties p ON tr.property_id = p.property_id
    WHERE tr.status = 'Unpaid' AND tr.property_id = ?
  `).all(user.property_id || user.id);
  
  res.render('user-dashboard', {
    session: req.session,
    user: user,
    taxRecords: taxRecords,
    pendingTaxes: pendingTaxes
  });
});

// User pay tax
app.post('/api/user/pay-tax', (req, res) => {
  if (!req.session.user) {
    return res.json({ success: false, message: 'Please login first' });
  }
  
  const { taxRecordId, amount } = req.body;
  const transactionId = generateTransactionId();
  const user = req.session.user;
  
  try {
    db.prepare(`UPDATE tax_records SET status = 'Paid' WHERE id = ?`).run(taxRecordId);
    db.prepare(`
      INSERT INTO payments (property_id, tax_record_id, amount, payment_method, transaction_id)
      VALUES (?, ?, ?, 'Online', ?)
    `).run(user.property_id || user.id, taxRecordId, amount, transactionId);
    
    res.json({ success: true, message: 'Payment successful!', transactionId });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// ==================== SMS REMINDER ROUTES ====================

// Simulated SMS sending function (in production, integrate with Twilio/etc.)
async function sendSMS(phone, message) {
  console.log(`[SMS] Sending to ${phone}: ${message}`);
  return true;
}

// Admin send reminder SMS
app.post('/api/admin/send-reminder', requireAdmin, async (req, res) => {
  const { propertyId, reminderType } = req.body;
  
  try {
    // Get property and tax info
    const property = db.prepare(`
      SELECT p.*, u.phone, u.name as user_name
      FROM properties p
      LEFT JOIN users u ON p.property_id = u.property_id
      WHERE p.property_id = ?
    `).get(propertyId);
    
    if (!property) {
      return res.json({ success: false, message: 'Property not found' });
    }
    
    const taxRecord = db.prepare(`
      SELECT * FROM tax_records 
      WHERE property_id = ? AND status = 'Unpaid'
      ORDER BY due_date ASC LIMIT 1
    `).get(propertyId);
    
    if (!taxRecord) {
      return res.json({ success: false, message: 'No pending tax found for this property' });
    }
    
    // Create reminder message
    let message = '';
    let daysBefore = 0;
    
    if (reminderType === '30') {
      message = `Dear ${property.owner_name}, This is a reminder that your property tax of Rs. ${taxRecord.tax_amount} is due in 30 days. Please pay on time to avoid penalties. - Grama Panchayat`;
      daysBefore = 30;
    } else if (reminderType === '20') {
      message = `Dear ${property.owner_name}, This is your 2nd reminder - your property tax of Rs. ${taxRecord.tax_amount} is due in 20 days. Please pay soon. - Grama Panchayat`;
      daysBefore = 20;
    } else if (reminderType === '15') {
      message = `Dear ${property.owner_name}, FINAL NOTICE - Your property tax of Rs. ${taxRecord.tax_amount} is due in 15 days. Please pay immediately to avoid penalty. - Grama Panchayat`;
      daysBefore = 15;
    } else {
      message = `Dear ${property.owner_name}, Please pay your pending property tax of Rs. ${taxRecord.tax_amount}. Due date: ${taxRecord.due_date}. - Grama Panchayat`;
    }
    
    // Send SMS if phone exists
    if (property.phone) {
      await sendSMS(property.phone, message);
      
      // Log SMS
      db.prepare(`
        INSERT INTO sms_logs (property_id, phone, message, status)
        VALUES (?, ?, ?, 'Sent')
      `).run(propertyId, property.phone, message);
    }
    
    // Update reminder as sent
    db.prepare(`
      INSERT INTO reminders (property_id, tax_record_id, reminder_type, reminder_days, reminder_date, sent, sms_sent)
      VALUES (?, ?, ?, ?, CURRENT_DATE, 1, 1)
    `).run(propertyId, taxRecord.id, reminderType + '_days_before', daysBefore);
    
    res.json({ success: true, message: 'Reminder sent successfully!', smsSent: !!property.phone });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// Admin view SMS logs
app.get('/admin-sms', requireAdmin, (req, res) => {
  const smsLogs = db.prepare(`
    SELECT s.*, p.owner_name 
    FROM sms_logs s
    JOIN properties p ON s.property_id = p.property_id
    ORDER BY s.sent_at DESC
  `).all();
  
  res.render('admin-sms', { session: req.session, smsLogs });
});

// Initialize database and start server
db.init().then(() => {
  console.log('Database initialized successfully!');
  app.listen(PORT, () => {
    console.log(`Smart Grama Panchayat Management System running at http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

