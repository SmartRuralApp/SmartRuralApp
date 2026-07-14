const fs = require('fs');
const path = require('path');

// Load environment variables
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const parts = trimmed.split('=');
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim().replace(/(^['"]|['"]$)/g, '');
      if (key) {
        process.env[key] = val;
      }
    }
  });
}

const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { exec } = require('child_process');
const db = require('./database');
const { saveDatabase } = db;

const app = express();
const PORT = process.env.PORT || 3000;

// SMS Gateway global verification status
let smsGatewayStatus = 'Pending Verification';
let smsGatewayError = null;

async function verifySMSGatewayConnection() {
  try {
    require('dotenv').config({ override: true });
  } catch (e) {
    console.error("Failed to dynamically reload .env file:", e.message);
  }

  const fast2smsKey = process.env.FAST2SMS_API_KEY;

  if (fast2smsKey && fast2smsKey.trim() !== '' && !fast2smsKey.includes('YOUR_')) {
    try {
      const response = await fetch('https://www.fast2sms.com/dev/wallet', {
        method: 'GET',
        headers: {
          'authorization': fast2smsKey
        }
      });
      const result = await response.json();
      if (result.return === true) {
        smsGatewayStatus = 'Connected';
        smsGatewayError = null;
        console.log("✓ SMS Gateway Connection verified: Fast2SMS credentials are valid.");
      } else {
        smsGatewayStatus = 'Error';
        smsGatewayError = result.message || 'Invalid Fast2SMS API key';
        console.error("✗ SMS Gateway Connection verification failed:", smsGatewayError);
      }
    } catch (err) {
      smsGatewayStatus = 'Error';
      smsGatewayError = err.message;
      console.error("✗ SMS Gateway Connection verification error:", err.message);
    }
  } else {
    smsGatewayStatus = 'Error';
    smsGatewayError = 'Missing SMS provider credentials (FAST2SMS_API_KEY) in .env file.';
    console.log("⚠ SMS Gateway Credentials not configured.");
  }
}

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'panchayat-secret-key-2026',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

// Debug request logger
app.use((req, res, next) => {
  console.log(`[DEBUG] ${req.method} ${req.url}`, {
    body: req.body,
    sessionUser: req.session ? req.session.user : null
  });
  next();
});

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ==================== HELPERS ====================

function updateOutdatedTaxStatuses() {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    
    // Update unpaid past due date to Overdue (High Risk)
    db.prepare(`
      UPDATE tax_records 
      SET status = 'Overdue', 
          predicted_status = 'High Risk',
          payment_probability = 85.0,
          xai_explanation = 'Automatically calculated default risk: High Risk (Overdue tax payment).'
      WHERE status != 'Paid' AND ? > due_date
    `).run(todayStr);

    // Update unpaid on or before due date to Pending (Medium Risk)
    db.prepare(`
      UPDATE tax_records 
      SET status = 'Pending', 
          predicted_status = 'Medium Risk',
          payment_probability = 55.0,
          xai_explanation = 'Automatically calculated default risk: Medium Risk (Tax due date has not passed).'
      WHERE (status = 'Unpaid' OR status = 'Overdue' OR status = 'Pending') AND ? <= due_date
    `).run(todayStr);

    // Update paid records to Low Risk
    db.prepare(`
      UPDATE tax_records 
      SET predicted_status = 'Low Risk',
          payment_probability = 10.0,
          xai_explanation = 'Tax is fully paid; low default risk.'
      WHERE status = 'Paid'
    `).run();
  } catch (error) {
    console.error("Failed to update outdated tax statuses in database:", error.message);
  }
}

function getCalculatedTaxStatus(record) {
  if (!record) return 'Pending';
  if (record.status && record.status.toLowerCase() === 'paid') {
    return 'Paid';
  }
  const todayStr = new Date().toISOString().split('T')[0];
  let dueDate = record.due_date;
  if (dueDate && dueDate.includes('T')) {
    dueDate = dueDate.split('T')[0];
  }
  if (todayStr > dueDate) {
    return 'Overdue';
  } else {
    return 'Pending';
  }
}

function getCalculatedTaxRisk(record) {
  const status = getCalculatedTaxStatus(record);
  if (status === 'Paid') {
    return { risk: 'Low Risk', probability: 10, explanation: 'Tax is fully paid; low default risk.' };
  } else if (status === 'Pending') {
    return { risk: 'Medium Risk', probability: 55, explanation: 'Automatically calculated default risk: Medium Risk (Tax due date has not passed).' };
  } else {
    return { risk: 'High Risk', probability: 85, explanation: 'Automatically calculated default risk: High Risk (Overdue tax payment).' };
  }
}

function generateTransactionId() {
  return 'TXN' + Date.now() + Math.floor(Math.random() * 1000);
}

// Call Python ML predict script
function runMLInference(task, data) {
  return new Promise((resolve, reject) => {
    const escapedJson = JSON.stringify(data).replace(/"/g, '\\"');
    const cmd = `python ml/predict.py ${task} "${escapedJson}"`;
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error("ML Prediction Error:", stderr || error.message);
        return reject(error);
      }
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (e) {
        reject(new Error("Failed to parse ML output: " + stdout));
      }
    });
  });
}

async function recalculateTaxML(recordId) {
  try {
    const record = db.prepare('SELECT * FROM tax_records WHERE id = ?').get(recordId);
    if (!record) return;

    const property = db.prepare('SELECT * FROM properties WHERE property_id = ?').get(record.property_id);
    const property_type = property ? property.property_type : 'Residential';

    const totalTaxes = db.prepare('SELECT COUNT(*) as count FROM tax_records WHERE property_id = ?').get(record.property_id).count || 0;
    const unpaidTaxes = db.prepare("SELECT COUNT(*) as count FROM tax_records WHERE property_id = ? AND status IN ('Unpaid', 'Overdue', 'Pending')").get(record.property_id).count || 0;
    const history_paid_ratio = totalTaxes > 0 ? (totalTaxes - unpaidTaxes) / totalTaxes : 1.0;
    const late_payments = unpaidTaxes;

    const mlResult = await runMLInference('--predict-defaulter', {
      property_type,
      tax_amount: record.tax_amount,
      year: record.year,
      history_paid_ratio,
      late_payments,
      status: record.status
    });

    db.prepare(`
      UPDATE tax_records 
      SET predicted_status = ?, payment_probability = ?, xai_explanation = ?
      WHERE id = ?
    `).run(mlResult.risk, mlResult.probability, mlResult.reasons.join(' | '), recordId);
    
    saveDatabase();
  } catch (error) {
    console.error("Error recalculating Tax ML:", error.message);
  }
}



// Create notification in database
function createNotification(userId, role, title, message, type) {
  try {
    db.prepare(`
      INSERT INTO notifications (user_id, role, title, message, type)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, role, title, message, type);
    console.log(`Notification created: [${role}] ${title}`);
  } catch (e) {
    console.error("Error creating notification:", e.message);
  }
}

// ==================== PUBLIC ROUTES ====================

// Landing Page
app.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect('/user-dashboard');
  }
  if (req.session.admin) {
    return res.redirect('/admin-dashboard');
  }
  res.render('landing', { session: req.session });
});

app.get('/home', (req, res) => {
  res.locals.page = 'home';
  try {
    updateOutdatedTaxStatuses();

    const totalCollection = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM payments
    `).get() || { total: 0 };

    const pendingCount = db.prepare(`
      SELECT COUNT(*) as count FROM tax_records WHERE status = 'Pending'
    `).get() || { count: 0 };

    const overdueCount = db.prepare(`
      SELECT COUNT(*) as count FROM tax_records WHERE status = 'Overdue'
    `).get() || { count: 0 };

    const totalProperties = db.prepare(`
      SELECT COUNT(*) as count FROM properties
    `).get() || { count: 0 };

    const totalCitizens = db.prepare(`
      SELECT COUNT(*) as count FROM users
    `).get() || { count: 0 };

    const totalComplaints = db.prepare(`
      SELECT COUNT(*) as count FROM complaints
    `).get() || { count: 0 };

    const recentNotifications = db.prepare(`
      SELECT * FROM notifications 
      WHERE role = 'Citizen' 
      ORDER BY created_at DESC LIMIT 5
    `).all() || [];

    const schemes = db.prepare('SELECT * FROM government_schemes').all() || [];
    const services = db.prepare('SELECT * FROM services WHERE status = "Active" LIMIT 4').all() || [];

    res.render('index', {
      stats: {
        collection: totalCollection.total || 0,
        pending: pendingCount.count || 0,
        overdue: overdueCount.count || 0,
        properties: totalProperties.count || 0,
        citizens: totalCitizens.count || 0,
        complaints: totalComplaints.count || 0
      },
      recentNotifications,
      session: req.session,
      schemes,
      services
    });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Tax search page
app.get('/tax-search', (req, res) => {
  res.locals.page = 'tax';
  res.render('tax-search', { session: req.session });
});

// Search tax records (supports both query-based and searchType/searchValue based calls)
app.post('/api/search-tax', async (req, res) => {
  const { query, searchType, searchValue } = req.body;
  const searchVal = query || searchValue;
  const type = searchType || 'propertyId';
  
  if (!searchVal) {
    return res.json([]);
  }

  try {
    updateOutdatedTaxStatuses();
    let results = [];
    if (type === 'ownerName') {
      results = db.prepare(`
        SELECT tr.*, p.owner_name, p.address, p.property_type
        FROM tax_records tr
        JOIN properties p ON tr.property_id = p.property_id
        WHERE p.owner_name LIKE ?
        ORDER BY tr.year DESC
      `).all(`%${searchVal}%`);
    } else {
      results = db.prepare(`
        SELECT tr.*, p.owner_name, p.address, p.property_type
        FROM tax_records tr
        JOIN properties p ON tr.property_id = p.property_id
        WHERE tr.property_id LIKE ?
        ORDER BY tr.year DESC
      `).all(`%${searchVal}%`);
    }
    
    for (let record of results) {
      record.status = getCalculatedTaxStatus(record);
      const riskInfo = getCalculatedTaxRisk(record);
      record.predicted_status = riskInfo.risk;
      record.payment_probability = riskInfo.probability;
      record.xai_explanation = riskInfo.explanation;
    }

    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Pay tax api - Support standard payload
app.post('/api/pay-tax', (req, res) => {
  const { propertyId, taxId, amount } = req.body;
  const txnId = generateTransactionId();
  
  try {
    db.prepare("UPDATE tax_records SET status = 'Paid', predicted_status = 'No Risk', payment_probability = 0.0 WHERE id = ?").run(taxId);
    db.prepare('INSERT INTO payments (property_id, tax_record_id, amount, transaction_id) VALUES (?, ?, ?, ?)').run(propertyId, taxId, amount, txnId);
    
    // Create citizen dashboard notification
    createNotification(
      propertyId, 'Citizen',
      'Tax Payment Successful',
      `Payment of ₹${amount} received successfully for your property tax. Transaction ID: ${txnId}.`,
      'Tax'
    );
    
    res.json({ success: true, txnId });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Make payment endpoint (called by public search-tax module)
app.post('/api/make-payment', (req, res) => {
  const { propertyId, taxRecordId, amount } = req.body;
  const txnId = generateTransactionId();

  try {
    db.prepare(`
      UPDATE tax_records SET status = 'Paid', predicted_status = 'No Risk', payment_probability = 0.0 WHERE id = ?
    `).run(taxRecordId);

    db.prepare(`
      INSERT INTO payments (property_id, tax_record_id, amount, transaction_id)
      VALUES (?, ?, ?, ?)
    `).run(propertyId, taxRecordId, amount, txnId);

    // Create citizen dashboard notification
    createNotification(
      propertyId, 'Citizen',
      'Tax Payment Successful',
      `Payment of ₹${amount} received successfully for your property tax. Transaction ID: ${txnId}.`,
      'Tax'
    );

    res.json({ 
      success: true, 
      message: 'Payment successful!',
      transactionId: txnId 
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// Book Offline Payment Endpoint (called by Citizen Portal)
app.post('/api/book-offline-payment', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ success: false, error: 'Unauthorized. Please login first.' });
  }
  const { propertyId, taxRecordId, amount, appointmentDate, appointmentTime } = req.body;
  if (!propertyId || !taxRecordId || !amount || !appointmentDate || !appointmentTime) {
    return res.status(400).json({ success: false, error: 'Missing required appointment booking fields.' });
  }

  try {
    const user = db.prepare('SELECT * FROM users WHERE property_id = ?').get(propertyId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Citizen profile not found for this Property ID.' });
    }

    const citizenName = user.name;
    const phone = user.phone;

    db.prepare(`
      INSERT INTO appointments (property_id, citizen_name, phone, appointment_date, appointment_time, tax_amount, payment_type, status, tax_record_id)
      VALUES (?, ?, ?, ?, ?, ?, 'Offline', 'Pending', ?)
    `).run(propertyId, citizenName, phone, appointmentDate, appointmentTime, amount, taxRecordId);

    // Save notification
    createNotification(
      propertyId, 
      'Citizen', 
      'Offline Payment Appointment Booked', 
      `Your offline payment appointment has been successfully scheduled for ${appointmentDate} at ${appointmentTime}. Status: Pending.`, 
      'System'
    );

    // Send confirmation SMS
    const smsMsg = `Dear ${citizenName}, Your offline payment appointment has been booked for ${appointmentDate} at ${appointmentTime}. Status: Pending. — Smart Gram Panchayat`;
    const smsResult = await sendSMSGateway(phone, citizenName, propertyId, smsMsg);
    
    // Log SMS transaction
    db.prepare(`
      INSERT INTO sms_logs (property_id, phone, message, status, citizen_name, tax_status, error_message, tax_amount, due_date, gateway_response_id, provider)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(propertyId, phone, smsMsg, smsResult.status, citizenName, 'Pending', smsResult.error, amount, appointmentDate, smsResult.responseId || null, smsResult.provider || 'None');

    saveDatabase();
    res.json({ success: true, message: 'Appointment booked successfully!' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update Appointment Status (Approved, Rejected, Completed) (called by Admin Dashboard)
app.post('/api/admin/update-appointment', requireAdmin, async (req, res) => {
  const { id, status } = req.body;
  if (!id || !status) {
    return res.status(400).json({ success: false, error: 'Missing appointment ID or status.' });
  }

  try {
    const appointment = db.prepare('SELECT * FROM appointments WHERE id = ?').get(id);
    if (!appointment) {
      return res.status(404).json({ success: false, error: 'Appointment not found.' });
    }

    db.prepare('UPDATE appointments SET status = ? WHERE id = ?').run(status, id);

    if (status === 'Completed') {
      // 1. Mark corresponding tax record as Paid
      db.prepare(`
        UPDATE tax_records 
        SET status = 'Paid', predicted_status = 'No Risk', payment_probability = 0.0, override_status = 'No Risk'
        WHERE id = ?
      `).run(appointment.tax_record_id);

      // 2. Generate a payment receipt transaction
      const txnId = 'TXN_OFFLINE_' + Date.now();
      db.prepare(`
        INSERT INTO payments (property_id, tax_record_id, amount, transaction_id)
        VALUES (?, ?, ?, ?)
      `).run(appointment.property_id, appointment.tax_record_id, appointment.tax_amount, txnId);

      // 3. Citizen payment success notification
      createNotification(
        appointment.property_id, 
        'Citizen', 
        'Tax Payment Successful', 
        `Offline payment of ₹${appointment.tax_amount.toLocaleString('en-IN')} has been received and processed. Your tax record is now marked as Paid. Transaction ID: ${txnId}.`, 
        'Tax'
      );
    } else {
      // Approved / Rejected notifications
      createNotification(
        appointment.property_id, 
        'Citizen', 
        'Appointment ' + status, 
        `Your offline payment appointment scheduled for ${appointment.appointment_date} at ${appointment.appointment_time} has been ${status.toLowerCase()} by the Panchayat administrator.`, 
        'System'
      );

      // Send status update SMS
      const smsMsg = `Dear ${appointment.citizen_name}, Your offline payment appointment scheduled for ${appointment.appointment_date} at ${appointment.appointment_time} has been ${status}. — Smart Gram Panchayat`;
      const smsResult = await sendSMSGateway(appointment.phone, appointment.citizen_name, appointment.property_id, smsMsg);
      
      // Log SMS transaction
      db.prepare(`
        INSERT INTO sms_logs (property_id, phone, message, status, citizen_name, tax_status, error_message, tax_amount, due_date, gateway_response_id, provider)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(appointment.property_id, appointment.phone, smsMsg, smsResult.status, appointment.citizen_name, 'Pending', smsResult.error, appointment.tax_amount, appointment.appointment_date, smsResult.responseId || null, smsResult.provider || 'None');
    }

    saveDatabase();
    res.json({ success: true, message: 'Appointment updated successfully!' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});



// Services page
app.get('/services', (req, res) => {
  const services = db.prepare('SELECT * FROM services WHERE status = "Active"').all();
  res.render('services', { services: services || [], session: req.session });
});

// Scheme details page
app.get('/schemes/:id', (req, res) => {
  const { id } = req.params;
  try {
    const scheme = db.prepare('SELECT * FROM government_schemes WHERE id = ?').get(id);
    if (!scheme) {
      return res.status(404).send('Scheme not found');
    }
    res.render('scheme-details', { scheme, session: req.session });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Service details page
app.get('/services/:id', (req, res) => {
  const { id } = req.params;
  try {
    const service = db.prepare('SELECT * FROM services WHERE id = ?').get(id);
    if (!service) {
      return res.status(404).send('Service not found');
    }
    res.render('service-details', { service, session: req.session });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// payment-success
app.get('/payment-success', (req, res) => {
  const { txnId, amount, propertyId } = req.query;
  res.render('payment-success', { 
    transactionId: txnId, 
    amount, 
    propertyId,
    session: req.session 
  });
});

// ==================== CITIZEN AUTH & DASHBOARD ====================

app.get('/user-login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/user-dashboard');
  }
  res.render('user-login', { session: req.session, error: null });
});

app.post('/user-login', (req, res) => {
  const { username, password } = req.body;

  // Try username and password first
  let user = db.prepare(`
    SELECT * FROM users WHERE LOWER(username) = LOWER(?) AND password = ?
  `).get(username, password);

  // Fallback to propertyId and phone for legacy logins
  if (!user) {
    user = db.prepare(`
      SELECT * FROM users WHERE LOWER(property_id) = LOWER(?) AND phone = ?
    `).get(username, password);
  }

  if (user) {
    req.session.user = user;
    res.redirect('/user-dashboard');
  } else {
    res.render('user-login', { 
      session: req.session, 
      error: 'Invalid Username/Property ID or Password/Mobile Number' 
    });
  }
});

app.get('/user-register', (req, res) => {
  const properties = db.prepare('SELECT property_id, owner_name FROM properties ORDER BY property_id ASC').all() || [];
  res.render('user-register', { session: req.session, properties, error: null, success: null });
});

app.post('/user-register', (req, res) => {
  const { name, age, gender, phone, email, propertyId, address, ward, occupation, aadhaar, username, password } = req.body;

  try {
    // 1. Look up the citizen in users by property_id (which contains all records from Citizen_dataset.xlsx)
    const user = db.prepare('SELECT * FROM users WHERE property_id = ?').get(propertyId);
    
    if (!user) {
      const properties = db.prepare('SELECT property_id, owner_name FROM properties ORDER BY property_id ASC').all() || [];
      return res.render('user-register', {
        session: req.session,
        properties,
        error: 'Registration failed. Property ID is not registered in the Gram Panchayat system.',
        success: null
      });
    }

    // 2. Verify that the Property ID and Mobile Number exist/match in the dataset (i.e. match the row in users)
    if (user.phone !== phone) {
      const properties = db.prepare('SELECT property_id, owner_name FROM properties ORDER BY property_id ASC').all() || [];
      return res.render('user-register', {
        session: req.session,
        properties,
        error: 'Registration failed. Mobile Number does not match the record for this Property ID.',
        success: null
      });
    }

    // 3. Check if they are already registered
    if (user.is_registered === 1) {
      const properties = db.prepare('SELECT property_id, owner_name FROM properties ORDER BY property_id ASC').all() || [];
      return res.render('user-register', {
        session: req.session,
        properties,
        error: 'This Property ID is already linked to another registered citizen.',
        success: null
      });
    }

    // 4. Check if the chosen username is already taken by another registered citizen
    const existingUsername = db.prepare('SELECT COUNT(*) as count FROM users WHERE LOWER(username) = LOWER(?) AND property_id != ? AND is_registered = 1').get(username, propertyId).count;
    if (existingUsername > 0) {
      const properties = db.prepare('SELECT property_id, owner_name FROM properties ORDER BY property_id ASC').all() || [];
      return res.render('user-register', {
        session: req.session,
        properties,
        error: 'Username is already taken.',
        success: null
      });
    }

    // Update their details in the database
    db.prepare(`
      UPDATE users 
      SET name = ?, phone = ?, email = ?, password = ?, age = ?, gender = ?, occupation = ?, address = ?, ward = ?, aadhaar = ?, username = ?, is_registered = 1
      WHERE property_id = ?
    `).run(name, phone, email, password, parseInt(age), gender, occupation, address, ward, aadhaar || null, username, propertyId);

    // Create notifications for citizen and admin
    createNotification(
      propertyId, 'Citizen',
      'Account Registered Successfully',
      `Welcome ${name}! Your citizen account has been successfully linked to Property ID ${propertyId}.`,
      'System'
    );

    createNotification(
      'admin', 'Admin',
      'New Citizen Registered',
      `A new citizen ${name} has registered under Property ID ${propertyId}.`,
      'System'
    );

    const properties = db.prepare('SELECT property_id, owner_name FROM properties ORDER BY property_id ASC').all() || [];
    res.render('user-register', {
      session: req.session,
      properties,
      error: null,
      success: 'Registration successful! You can now log in.'
    });

  } catch (err) {
    console.error("Error registering user:", err.message);
    const properties = db.prepare('SELECT property_id, owner_name FROM properties ORDER BY property_id ASC').all() || [];
    res.render('user-register', {
      session: req.session,
      properties,
      error: 'An internal server error occurred during registration.',
      success: null
    });
  }
});

app.get('/user-logout', (req, res) => {
  req.session.user = null;
  res.redirect('/');
});

// Citizen dashboard (with scheme recommendations)
app.get('/user-dashboard', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/user-login');
  }
  
  const user = db.prepare('SELECT * FROM users WHERE property_id = ?').get(req.session.user.property_id) || req.session.user;
  req.session.user = user;
  updateOutdatedTaxStatuses();
  const property = db.prepare('SELECT * FROM properties WHERE property_id = ?').get(user.property_id);
  const taxRecords = db.prepare('SELECT * FROM tax_records WHERE property_id = ? ORDER BY year DESC').all(user.property_id) || [];
  taxRecords.forEach(record => {
    record.status = getCalculatedTaxStatus(record);
  });
  const payments = db.prepare('SELECT * FROM payments WHERE property_id = ? ORDER BY payment_date DESC').all(user.property_id) || [];
  const complaints = db.prepare('SELECT * FROM complaints WHERE property_id = ? ORDER BY created_at DESC').all(user.property_id) || [];
  const notifications = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 10').all(user.property_id) || [];
  
  // Fetch schemes and services
  const services = db.prepare('SELECT * FROM services WHERE status = "Active"').all() || [];
  const schemes = db.prepare('SELECT * FROM government_schemes').all() || [];

  let recommendedSchemes = [];
  try {
    const mlResult = await runMLInference('--recommend-schemes', {
      age: user.age,
      gender: user.gender,
      occupation: user.occupation,
      income: user.income,
      land_size: user.land_size,
      is_farmer: user.is_farmer,
      is_student: user.is_student,
      disability: user.disability
    });
    
    recommendedSchemes = mlResult.recommendations || [];
    
    // Create notifications for newly eligible schemes
    recommendedSchemes.forEach(rec => {
      const existingNotif = db.prepare(`
        SELECT COUNT(*) as count FROM notifications 
        WHERE user_id = ? AND title = ?
      `).get(user.property_id, `Scheme Eligibility: ${rec.scheme}`).count;
      
      if (existingNotif === 0) {
        createNotification(
          user.property_id, 'Citizen',
          `Scheme Eligibility: ${rec.scheme}`,
          `Based on your updated citizen profile, you may be eligible for the ${rec.scheme} scheme. Confidence: ${rec.confidence * 100}%.`,
          'Scheme'
        );
      }
    });
  } catch (mlErr) {
    console.error("Scheme recommendation ML error:", mlErr.message);
  }

  res.render('user-dashboard', {
    session: req.session,
    property,
    taxRecords,
    payments,
    complaints,
    notifications,
    recommendedSchemes,
    services,
    schemes
  });
});
// Appointments endpoints removed

app.post('/api/notifications/read', (req, res) => {
  const { id } = req.body;
  try {
    db.prepare('UPDATE notifications SET read_status = 1 WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// File complaint (APPLICATION-FIRST WORKFLOW: save to database successfully before triggering Python subprocesses)
app.post('/api/complaints/suggest-category', async (req, res) => {
  const { description } = req.body;
  try {
    const mlResult = await runMLInference('--predict-category', { description });
    res.json({ success: true, category: mlResult.category, reasons: mlResult.reasons });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/complaints', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }  const { category, description, ward } = req.body;
  const propertyId = req.session.user.property_id;

  try {
    const catResult = await runMLInference('--predict-category', { description });
    const predictedCategory = catResult.category || category;
    const catConfidence = catResult.confidence || 1.0;

    // 1. Query database for all active complaints in same ward (excluding resolved)
    const existing = db.prepare(`
      SELECT * FROM complaints
      WHERE category = ? AND ward = ? AND status != 'Resolved'
    `).all(predictedCategory, ward) || [];

    const similarCount = existing.length;

    // 2. Run duplicate detection
    const dupResult = await runMLInference('--detect-duplicate', {
      description,
      category: predictedCategory,
      existing
    });

    let isDuplicate = 0;
    let duplicateOfId = null;
    if (dupResult.is_duplicate) {
      isDuplicate = 1;
      duplicateOfId = dupResult.duplicate_of_id;
    }

    // 3. Apply final priority rules based on active Count (Pending + In Progress)
    const emergencyKeywords = [
      "tree fallen", "electric pole fallen", "pole fallen", "live wire", "electric shock", "fire",
      "pipeline burst", "water pipeline burst", "burst pipe", "gas leak", "gas leakage", "building collapse",
      "road accident", "flood", "landslide", "drain overflow", "drainage overflow",
      "sewage overflow", "sewer overflow", "transformer blast", "power failure",
      "dangerous pothole", "road blocked", "road block", "bridge damage", "bridge damaged",
      "water contamination", "contaminated water", "immediate action", "life threatening",
      "life-threatening", "emergency", "accident hazard", "electrocution"
    ];
    const descLower = description.toLowerCase();
    const isEmergency = emergencyKeywords.some(keyword => descLower.includes(keyword));

    let priority = 'Low';
    if (isEmergency) {
      priority = 'High';
    } else {
      if (similarCount === 0) {
        priority = 'Low';
      } else if (similarCount === 1) {
        priority = 'Medium';
      } else if (similarCount >= 2) {
        priority = 'High';
      }
    }

    // Immediately recalculate priority of existing active complaints in this ward/category
    for (const comp of existing) {
      const compDescLower = comp.description.toLowerCase();
      const compIsEmergency = emergencyKeywords.some(keyword => compDescLower.includes(keyword));
      
      let newPrio = 'Low';
      if (compIsEmergency) {
        newPrio = 'High';
      } else {
        if (similarCount === 0) {
          newPrio = 'Low';
        } else if (similarCount === 1) {
          newPrio = 'Medium';
        } else if (similarCount >= 2) {
          newPrio = 'High';
        }
      }
      db.prepare('UPDATE complaints SET priority = ? WHERE id = ?').run(newPrio, comp.id);
    }

    // 4. Run ML priority prediction to get predicted_priority & confidence & xai_explanation
    let predictedPriority = priority;
    let prioConfidence = 1.0;
    let xaiExplanation = 'Grievance lodged in Panchayat records.';
    try {
      const historicalFrequency = db.prepare('SELECT COUNT(*) as count FROM complaints WHERE ward = ?').get(ward).count || 0;
      const prioResult = await runMLInference('--predict-priority', {
        description,
        category: predictedCategory,
        ward,
        similar_count: similarCount,
        is_duplicate: isDuplicate,
        historical_frequency: historicalFrequency
      });
      predictedPriority = prioResult.priority;
      prioConfidence = prioResult.confidence;
      xaiExplanation = prioResult.reasons.join(' | ');
    } catch (mlErr) {
      console.error("Non-blocking ML Prediction failed:", mlErr.message);
    }

    // 5. Insert single record with correct priority and predictions
    db.prepare(`
      INSERT INTO complaints (property_id, category, description, ward, priority, predicted_priority, predicted_category, confidence_score, is_duplicate, duplicate_of_id, xai_explanation)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(propertyId, category, description, ward, priority, predictedPriority, predictedCategory, prioConfidence, isDuplicate, duplicateOfId, xaiExplanation);

    const complaintId = db.prepare('SELECT last_insert_rowid() AS id').get().id;

    if (isDuplicate) {
      createNotification(
        'admin', 'Admin',
        'Duplicate Complaint Detected',
        `Property ${propertyId} filed a duplicate complaint of ID ${duplicateOfId} (${dupResult.similarity * 100}% similarity).`,
        'Duplicate'
      );
    }

    if (priority === 'High') {
      createNotification(
        'admin', 'Admin',
        'High Priority Complaint Alert',
        `A High Priority complaint has been submitted: "${description.substring(0, 60)}..." in ${ward}.`,
        'Alert'
      );
    }

    res.json({
      success: true,
      message: isDuplicate ? 'Warning: Similar complaint already registered. Complaint recorded and linked.' : 'Complaint registered successfully!',
      priority,
      is_duplicate: isDuplicate === 1,
      duplicate_of_id: duplicateOfId,
      xai_explanation: xaiExplanation
    });

  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// ==================== ADMIN ROUTES & LOGS ====================

function requireAdmin(req, res, next) {
  if (!req.session.admin) {
    return res.redirect('/admin-login');
  }
  next();
}

app.get('/admin-login', (req, res) => {
  if (req.session.admin) return res.redirect('/admin-dashboard');
  res.render('admin-login', { session: req.session, error: null });
});

app.post('/admin-login', (req, res) => {
  const { username, password } = req.body;
  const admin = db.prepare('SELECT * FROM admin_users WHERE username = ? AND password = ?').get(username, password);
  if (admin) {
    req.session.admin = true;
    res.redirect('/admin-dashboard');
  } else {
    res.render('admin-login', { session: req.session, error: 'Invalid credentials' });
  }
});

app.get('/admin-forgot-password', (req, res) => {
  res.render('admin-forgot-password', { session: req.session, error: null, success: null });
});

app.post('/admin-forgot-password', (req, res) => {
  const { username, securityKey, newPassword, confirmPassword } = req.body;
  try {
    if (securityKey !== 'GP2026') {
      return res.render('admin-forgot-password', { session: req.session, error: 'Invalid Gram Panchayat Security Key.', success: null });
    }
    if (newPassword !== confirmPassword) {
      return res.render('admin-forgot-password', { session: req.session, error: 'Passwords do not match.', success: null });
    }
    const adminUser = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
    if (!adminUser) {
      return res.render('admin-forgot-password', { session: req.session, error: 'Admin username not found.', success: null });
    }
    db.prepare('UPDATE admin_users SET password = ? WHERE username = ?').run(newPassword, username);
    res.render('admin-forgot-password', { session: req.session, error: null, success: 'Password reset successfully! You can now log in.' });
  } catch (err) {
    res.render('admin-forgot-password', { session: req.session, error: err.message, success: null });
  }
});



app.get('/admin-logout', (req, res) => {
  req.session.admin = false;
  res.redirect('/');
});

app.get('/admin-dashboard', requireAdmin, (req, res) => {
  try {
    updateOutdatedTaxStatuses();

    const totalCollection = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM payments
    `).get() || { total: 0 };

    const pendingCount = db.prepare(`
      SELECT COUNT(*) as count FROM tax_records WHERE status != 'Paid'
    `).get() || { count: 0 };

    const totalProperties = db.prepare(`
      SELECT COUNT(*) as count FROM properties
    `).get() || { count: 0 };

    const totalCitizens = db.prepare(`
      SELECT COUNT(*) as count FROM users
    `).get() || { count: 0 };



    const totalComplaints = db.prepare(`
      SELECT COUNT(*) as count FROM complaints
    `).get() || { count: 0 };

    const highPriorityComplaints = db.prepare(`
      SELECT COUNT(*) as count FROM complaints WHERE priority = 'High'
    `).get() || { count: 0 };

    const activeSchemes = db.prepare(`
      SELECT COUNT(*) as count FROM government_schemes
    `).get() || { count: 0 };

    const activeServices = db.prepare(`
      SELECT COUNT(*) as count FROM services WHERE status = 'Active'
    `).get() || { count: 0 };

    const recentPayments = db.prepare(`
      SELECT pay.*, p.owner_name 
      FROM payments pay
      JOIN properties p ON pay.property_id = p.property_id
      ORDER BY pay.payment_date DESC LIMIT 5
    `).all() || [];

    const alerts = db.prepare(`
      SELECT * FROM notifications 
      WHERE role = 'Admin' AND read_status = 0
      ORDER BY created_at DESC LIMIT 10
    `).all() || [];

    // ML Metadata
    let mlMeta = { version: 'N/A', last_trained: 'Never', dataset_size: 0 };
    const metaPath = path.join(__dirname, 'models', 'metadata.json');
    if (fs.existsSync(metaPath)) {
      try {
        const raw = fs.readFileSync(metaPath, 'utf8');
        const data = JSON.parse(raw);
        mlMeta.version = data.version || '1';
        mlMeta.last_trained = data.last_trained || 'N/A';
        
        let totalSize = 0;
        if (data.models) {
          Object.keys(data.models).forEach(k => {
            totalSize += data.models[k].dataset_size || 0;
          });
        }
        mlMeta.dataset_size = Math.round(totalSize / 4); // Avg across 4 models
      } catch (e) {
        console.error("Error reading ML metadata:", e.message);
      }
    }

    // Dashboard Aggregates for Chart.js
    const complaints = db.prepare('SELECT category, priority, is_duplicate FROM complaints').all() || [];
    const priorityDist = { High: 0, Medium: 0, Low: 0 };
    const catDist = {};
    let duplicatesCount = 0;
    complaints.forEach(c => {
      priorityDist[c.priority] = (priorityDist[c.priority] || 0) + 1;
      catDist[c.category] = (catDist[c.category] || 0) + 1;
      if (c.is_duplicate) duplicatesCount++;
    });
    const unpaidTaxes = db.prepare('SELECT predicted_status FROM tax_records WHERE status != "Paid"').all() || [];
    const defaultRiskDist = { "High Risk": 0, "Medium Risk": 0, "Low Risk": 0 };
    unpaidTaxes.forEach(t => {
      defaultRiskDist[t.predicted_status] = (defaultRiskDist[t.predicted_status] || 0) + 1;
    });

    const highRiskDefaulters = db.prepare(`
      SELECT tr.*, p.owner_name, u.phone
      FROM tax_records tr
      JOIN properties p ON tr.property_id = p.property_id
      LEFT JOIN users u ON tr.property_id = u.property_id
      WHERE tr.status != 'Paid' AND tr.predicted_status = 'High Risk'
      ORDER BY tr.payment_probability DESC LIMIT 5
    `).all() || [];

    // Query Offline payment appointments
    const todayAppointments = db.prepare(`
      SELECT COUNT(*) as count FROM appointments 
      WHERE appointment_date = date('now')
    `).get() || { count: 0 };

    const appointments = db.prepare(`
      SELECT * FROM appointments 
      ORDER BY appointment_date ASC, appointment_time ASC
    `).all() || [];

    res.render('admin-dashboard', {
      session: req.session,
      stats: {
        collection: totalCollection.total || 0,
        pending: pendingCount.count || 0,
        properties: totalProperties.count || 0,
        citizens: totalCitizens.count || 0,
        todayAppointments: todayAppointments.count || 0,
        totalComplaints: totalComplaints.count || 0,
        highPriorityComplaints: highPriorityComplaints.count || 0,
        activeSchemes: activeSchemes.count || 0,
        activeServices: activeServices.count || 0
      },
      recentPayments,
      highRiskDefaulters,
      appointments,
      alerts,
      mlMeta,
      charts: {
        priorityDist,
        catDist,
        defaultRiskDist,
        duplicatesCount
      }
    });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// ==================== PROPERTIES CRUD ====================

app.get('/admin-properties', requireAdmin, (req, res) => {
  const properties = db.prepare('SELECT * FROM properties ORDER BY created_at DESC').all() || [];
  res.render('admin-properties', { session: req.session, properties });
});

app.post('/api/admin/add-property', requireAdmin, (req, res) => {
  const { propertyId, ownerName, address, propertyType } = req.body;
  if (!propertyId || !ownerName) {
    return res.json({ success: false, message: 'Property ID and Owner Name are required.' });
  }
  try {
    db.prepare(`
      INSERT INTO properties (property_id, owner_name, address, property_type)
      VALUES (?, ?, ?, ?)
    `).run(propertyId.toUpperCase(), ownerName, address || 'Panchayat Area', propertyType || 'Residential');
    res.json({ success: true, message: 'Property registered successfully!' });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

app.post('/api/admin/update-property', requireAdmin, (req, res) => {
  const { id, ownerName, address, propertyType } = req.body;
  try {
    db.prepare(`
      UPDATE properties SET owner_name = ?, address = ?, property_type = ?
      WHERE id = ?
    `).run(ownerName, address, propertyType, id);
    res.json({ success: true, message: 'Property updated successfully!' });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

app.post('/api/admin/delete-property', requireAdmin, (req, res) => {
  const { id } = req.body;
  try {
    db.prepare('DELETE FROM properties WHERE id = ?').run(id);
    res.json({ success: true, message: 'Property deleted successfully!' });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// ==================== CITIZENS CRUD ====================

app.get('/admin-citizens', requireAdmin, (req, res) => {
  const citizens = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() || [];
  const properties = db.prepare(`
    SELECT p.property_id, p.owner_name, u.id as user_id
    FROM properties p
    LEFT JOIN users u ON p.property_id = u.property_id
  `).all() || [];
  res.render('admin-citizens', { session: req.session, citizens, properties });
});
app.post('/api/admin/add-citizen', requireAdmin, (req, res) => {
  const { propertyId, name, phone, email, password, age, gender, occupation, income, landSize, isFarmer, isStudent, disability, address, ward, aadhaar, username } = req.body;
  if (!propertyId || !name || !phone || !username) {
    return res.json({ success: false, message: 'Property ID, Name, Phone, and Username are required.' });
  }
  try {
    db.prepare(`
      INSERT INTO users (property_id, name, phone, email, password, age, gender, occupation, income, land_size, is_farmer, is_student, disability, address, ward, aadhaar, username)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      propertyId.toUpperCase(), name, phone, email || '', password || 'user123',
      parseInt(age) || 30, gender || 'Male', occupation || 'Agriculture',
      parseFloat(income) || 80000.0, parseFloat(landSize) || 1.5,
      parseInt(isFarmer) || 0, parseInt(isStudent) || 0, parseInt(disability) || 0,
      address || '', ward || 'Ward 1', aadhaar || '', username
    );

    createNotification(
      'admin', 'Admin',
      'New Citizen Registration',
      `Citizen ${name} has been registered successfully with Property ID ${propertyId.toUpperCase()}.`,
      'System'
    );

    res.json({ success: true, message: 'Citizen profile registered successfully!' });
  } catch (e) {
    let msg = e.message;
    if (msg.includes('UNIQUE constraint failed: users.property_id')) {
      msg = `This Property ID (${propertyId.toUpperCase()}) is already registered to another citizen profile.`;
    } else if (msg.includes('UNIQUE constraint failed: users.username')) {
      msg = `The username '${username}' is already taken. Please choose another.`;
    }
    res.json({ success: false, message: msg });
  }
});

app.post('/api/admin/update-citizen', requireAdmin, (req, res) => {
  const { id, name, phone, email, age, gender, occupation, income, landSize, isFarmer, isStudent, disability, address, ward, aadhaar, username } = req.body;
  try {
    db.prepare(`
      UPDATE users 
      SET name = ?, phone = ?, email = ?, age = ?, gender = ?, occupation = ?, income = ?, land_size = ?, is_farmer = ?, is_student = ?, disability = ?, address = ?, ward = ?, aadhaar = ?, username = ?
      WHERE id = ?
    `).run(
      name, phone, email, parseInt(age), gender, occupation,
      parseFloat(income), parseFloat(landSize), parseInt(isFarmer), parseInt(isStudent), parseInt(disability),
      address || '', ward || 'Ward 1', aadhaar || '', username, id
    );
    res.json({ success: true, message: 'Citizen profile updated successfully!' });
  } catch (e) {
    let msg = e.message;
    if (msg.includes('UNIQUE constraint failed: users.username')) {
      msg = `The username '${username}' is already taken. Please choose another.`;
    }
    res.json({ success: false, message: msg });
  }
});

app.post('/api/admin/delete-citizen', requireAdmin, (req, res) => {
  const { id } = req.body;
  try {
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    res.json({ success: true, message: 'Citizen profile deleted successfully!' });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// ==================== SCHEMES CRUD ====================

app.get('/admin-schemes', requireAdmin, (req, res) => {
  const schemes = db.prepare('SELECT * FROM government_schemes').all() || [];
  res.render('admin-schemes', { session: req.session, schemes });
});

app.post('/api/admin/add-scheme', requireAdmin, (req, res) => {
  const { title, description, targetCriteria } = req.body;
  try {
    db.prepare(`
      INSERT INTO government_schemes (title, description, target_criteria)
      VALUES (?, ?, ?)
    `).run(title, description, targetCriteria);
    res.json({ success: true, message: 'Welfare Scheme registered successfully!' });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

app.post('/api/admin/update-scheme', requireAdmin, (req, res) => {
  const { id, title, description, targetCriteria } = req.body;
  try {
    db.prepare(`
      UPDATE government_schemes SET title = ?, description = ?, target_criteria = ?
      WHERE id = ?
    `).run(title, description, targetCriteria, id);
    res.json({ success: true, message: 'Welfare Scheme updated successfully!' });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

app.post('/api/admin/delete-scheme', requireAdmin, (req, res) => {
  const { id } = req.body;
  try {
    db.prepare('DELETE FROM government_schemes WHERE id = ?').run(id);
    res.json({ success: true, message: 'Welfare Scheme deleted successfully!' });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// ==================== SERVICES & TAX MANAGEMENT ====================

app.get('/admin-tax', requireAdmin, (req, res) => {
  updateOutdatedTaxStatuses();
  const taxRecords = db.prepare(`
    SELECT tr.*, p.owner_name, p.property_type
    FROM tax_records tr
    JOIN properties p ON tr.property_id = p.property_id
    ORDER BY tr.created_at DESC
  `).all() || [];

  taxRecords.forEach(record => {
    record.status = getCalculatedTaxStatus(record);
  });

  res.render('admin-tax', { session: req.session, taxRecords });
});
app.post('/api/admin/override-tax-prediction', requireAdmin, (req, res) => {
  const { id, risk } = req.body;
  try {
    db.prepare(`
      UPDATE tax_records 
      SET override_status = ?, admin_corrected = ?
      WHERE id = ?
    `).run(risk || null, risk ? 1 : 0, id);
    saveDatabase();
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});


app.get('/admin-complaints', requireAdmin, (req, res) => {
  const complaints = db.prepare(`
    SELECT c.*, p.owner_name
    FROM complaints c
    JOIN properties p ON c.property_id = p.property_id
    ORDER BY c.created_at DESC
  `).all() || [];

  const duplicatesAnalysis = db.prepare(`
    SELECT c.id as original_id, c.ward, c.status, c.priority, c.category,
           COUNT(d.id) as duplicates_count, 
           GROUP_CONCAT(d.id, ', ') as linked_ids,
           GROUP_CONCAT(p.owner_name, ', ') as affected_citizens
    FROM complaints c
    JOIN complaints d ON c.id = d.duplicate_of_id
    LEFT JOIN properties p ON d.property_id = p.property_id
    GROUP BY c.id
  `).all() || [];

  res.render('admin-complaints', { session: req.session, complaints, duplicatesAnalysis });
});

app.post('/api/admin/override-complaint', requireAdmin, (req, res) => {
  const { id, category, priority } = req.body;
  try {
    db.prepare(`
      UPDATE complaints 
      SET category = ?, priority = ?, admin_corrected = 1, xai_explanation = 'Complaint priority/category manually corrected by administrator.'
      WHERE id = ?
    `).run(category, priority, parseInt(id));
    saveDatabase();
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/admin/delete-complaint', requireAdmin, (req, res) => {
  const { id } = req.body;
  try {
    db.prepare('DELETE FROM complaints WHERE id = ?').run(parseInt(id));
    saveDatabase();
    res.json({ success: true, message: 'Complaint deleted successfully!' });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/admin/update-complaint-status', requireAdmin, (req, res) => {
  const { id, status, remarks } = req.body;
  try {


    db.prepare('UPDATE complaints SET status = ?, admin_remarks = ? WHERE id = ?').run(status, remarks || null, id);
    
    const original = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id);
    if (original) {
      createNotification(
        original.property_id, 'Citizen',
        'Complaint Status Updated',
        `Your complaint (ID: #${id}, Category: ${original.category}) has been updated to '${status}'. Remarks: ${remarks || 'None'}.`,
        'Complaint'
      );

      if (status === 'Resolved') {
        const duplicates = db.prepare('SELECT * FROM complaints WHERE duplicate_of_id = ?').all(id) || [];
        for (const dup of duplicates) {
          db.prepare('UPDATE complaints SET status = ?, admin_remarks = ? WHERE id = ?').run(
            'Resolved',
            `Resolved via link to Original Complaint #${id}: ${remarks || 'None'}.`,
            dup.id
          );
          
          createNotification(
            dup.property_id, 'Citizen',
            'Linked Complaint Resolved',
            `The original issue (ID: #${id}) linked to your complaint (ID: #${dup.id}, Category: ${dup.category}) has been resolved. Your complaint status is now 'Resolved'.`,
            'Complaint'
          );
        }
      }
      saveDatabase();
    }
    
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.get('/admin-ml-performance', requireAdmin, (req, res) => {
  let metadata = null;
  const metaPath = path.join(__dirname, 'models', 'metadata.json');
  if (fs.existsSync(metaPath)) {
    try {
      metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch (e) {
      console.error("Error reading ML performance:", e.message);
    }
  }
  res.render('admin-ml-performance', { session: req.session, metadata });
});

// Export database records and retrain ML models
app.post('/api/admin/retrain', requireAdmin, async (req, res) => {
  try {
    console.log("Preparing DB export for retraining...");
    const complaints = db.prepare('SELECT id, description, category, priority FROM complaints').all() || [];
    
    const taxRecordsRaw = db.prepare(`
      SELECT tr.id, tr.property_id, p.property_type, tr.tax_amount, tr.year, tr.status
      FROM tax_records tr
      JOIN properties p ON tr.property_id = p.property_id
    `).all() || [];
    
    const taxes = taxRecordsRaw.map(t => {
      const unpaidTaxes = db.prepare("SELECT COUNT(*) as count FROM tax_records WHERE property_id = ? AND status IN ('Unpaid', 'Overdue', 'Pending')").get(t.property_id).count || 0;
      const totalTaxes = db.prepare('SELECT COUNT(*) as count FROM tax_records WHERE property_id = ?').get(t.property_id).count || 0;
      const history_paid_ratio = totalTaxes > 0 ? (totalTaxes - unpaidTaxes) / totalTaxes : 1.0;
      return {
        id: `T_DB_${t.id}`,
        property_type: t.property_type.toLowerCase() === 'commercial' ? 1 : 0,
        tax_amount: t.tax_amount,
        year: t.year,
        history_paid_ratio: parseFloat(history_paid_ratio.toFixed(2)),
        late_payments: unpaidTaxes,
        is_defaulter: (t.status === 'Unpaid' || t.status === 'Overdue' || t.status === 'Pending') ? 1 : 0
      };
    });

    const usersRaw = db.prepare('SELECT id, property_id, age, gender, occupation, income, land_size, is_farmer, is_student, disability FROM users').all() || [];
    const users = usersRaw.map(u => {
      let recommended_scheme = 'None';
      if (u.disability === 1 && u.income < 120000) recommended_scheme = 'Divyangjan Pension';
      else if (u.is_student === 1 && u.income < 200000 && u.age < 25) recommended_scheme = 'Post-Matric Scholarship';
      else if (u.is_farmer === 1 && u.land_size > 0 && u.occupation === 'Agriculture') recommended_scheme = 'PM Kisan';
      else if (u.income < 150000 && u.land_size < 0.5) recommended_scheme = 'PM Awas Yojana';
      else if (u.occupation === 'Laborer' || u.income < 100000) recommended_scheme = 'MGNREGA';
      
      return {
        id: `S_DB_${u.id}`,
        age: u.age,
        gender: u.gender,
        occupation: u.occupation,
        income: u.income,
        land_size: u.land_size,
        is_farmer: u.is_farmer,
        is_student: u.is_student,
        disability: u.disability,
        recommended_scheme
      };
    });

    const payload = { complaints, taxes, users };

    const cmd = 'python ml/train.py --retrain';
    const child = exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error("Retrain child process error:", stderr || error.message);
        return res.status(500).json({ success: false, error: error.message, logs: stderr });
      }
      res.json({ success: true, message: 'Latest database records exported and ML models retrained successfully!', logs: stdout });
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
// Admin appointments endpoints removed

// Admin services management
app.get('/admin-services', requireAdmin, (req, res) => {
  const services = db.prepare('SELECT * FROM services ORDER BY created_at DESC').all() || [];
  res.render('admin-services', { session: req.session, services });
});

app.post('/api/admin/add-service', requireAdmin, (req, res) => {
  const { title, description, icon, status } = req.body;
  try {
    db.prepare(`
      INSERT INTO services (title, description, icon, status)
      VALUES (?, ?, ?, ?)
    `).run(title, description, icon || 'fa-cogs', status || 'Active');
    res.json({ success: true, message: 'Service added successfully!' });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/admin/update-service', requireAdmin, (req, res) => {
  const { id, title, description, icon, status } = req.body;
  try {
    db.prepare(`
      UPDATE services SET title = ?, description = ?, icon = ?, status = ?
      WHERE id = ?
    `).run(title, description, icon, status, id);
    res.json({ success: true, message: 'Service updated successfully!' });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/admin/delete-service', requireAdmin, (req, res) => {
  const { id } = req.body;
  try {
    db.prepare('DELETE FROM services WHERE id = ?').run(id);
    res.json({ success: true, message: 'Service deleted successfully!' });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/admin/add-tax', requireAdmin, async (req, res) => {
  const { propertyId, taxAmount, dueDate, year, ownerName, status } = req.body;
  if (!propertyId || !taxAmount || !dueDate || !year) {
    return res.json({ success: false, message: 'All fields are required' });
  }
  try {
    const existing = db.prepare('SELECT id FROM tax_records WHERE property_id = ? AND year = ?').get(propertyId.toUpperCase(), parseInt(year));
    if (existing) {
      return res.json({ success: false, message: `A tax record already exists for Property ID ${propertyId.toUpperCase()} and Year ${year}.` });
    }

    let property = db.prepare('SELECT * FROM properties WHERE property_id = ?').get(propertyId);
    if (!property) {
      db.prepare(`
        INSERT INTO properties (property_id, owner_name, address, property_type)
        VALUES (?, ?, ?, 'Residential')
      `).run(propertyId.toUpperCase(), ownerName || 'Citizen', 'Panchayat Area');
    }
    const insertResult = db.prepare(`
      INSERT INTO tax_records (property_id, tax_amount, due_date, year, status)
      VALUES (?, ?, ?, ?, ?)
    `).run(propertyId.toUpperCase(), parseFloat(taxAmount), dueDate, parseInt(year), status || 'Unpaid');
    const lastId = db.prepare('SELECT last_insert_rowid() AS id').get().id;
    await recalculateTaxML(lastId);    
    res.json({ success: true, message: 'Tax record saved successfully!' });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

app.post('/api/admin/update-tax', requireAdmin, async (req, res) => {
  const { id, taxAmount, dueDate, year, status } = req.body;
  try {
    const current = db.prepare('SELECT property_id FROM tax_records WHERE id = ?').get(id);
    if (current) {
      const existing = db.prepare('SELECT id FROM tax_records WHERE property_id = ? AND year = ? AND id != ?').get(current.property_id, parseInt(year), id);
      if (existing) {
        return res.json({ success: false, message: `A tax record already exists for Property ID ${current.property_id} and Year ${year}.` });
      }
    }
    db.prepare(`
      UPDATE tax_records SET tax_amount = ?, due_date = ?, year = ?, status = ?
      WHERE id = ?
    `).run(taxAmount, dueDate, year, status, id);
    
    await recalculateTaxML(id);
    
    res.json({ success: true, message: 'Tax record updated successfully!' });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});


app.post('/api/admin/delete-tax', requireAdmin, (req, res) => {
  const { id } = req.body;
  try {
    db.prepare('DELETE FROM tax_records WHERE id = ?').run(id);
    res.json({ success: true, message: 'Tax record deleted successfully!' });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});
// ==================== SMS REMINDERS ROUTES ====================

app.get('/admin-reminders', requireAdmin, async (req, res) => {
  await verifySMSGatewayConnection();
  res.render('admin-reminders', { 
    session: req.session, 
    smsGatewayStatus, 
    smsGatewayError 
  });
});

app.get('/api/admin/pending-reminders', requireAdmin, (req, res) => {
  try {
    updateOutdatedTaxStatuses();
    const unpaid = db.prepare(`
      SELECT tr.*, p.owner_name
      FROM tax_records tr
      JOIN properties p ON tr.property_id = p.property_id
      WHERE tr.status != 'Paid'
    `).all() || [];

    const pendingReminders = [];
    const todayStr = new Date().toISOString().split('T')[0];
    
    unpaid.forEach(record => {
      let dueDateStr = record.due_date;
      if (dueDateStr && dueDateStr.includes('T')) {
        dueDateStr = dueDateStr.split('T')[0];
      }
      const diffTime = new Date(dueDateStr) - new Date(todayStr);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      let reminder_days = 'Early Reminder';
      if (todayStr > dueDateStr) {
        reminder_days = 'Overdue Reminder';
      } else if (diffDays >= 0 && diffDays <= 7) {
        reminder_days = 'Final Reminder';
      }
      
      const remDate = new Date();
      
      pendingReminders.push({
        property_id: record.property_id,
        owner_name: record.owner_name,
        tax_amount: record.tax_amount,
        due_date: record.due_date,
        reminder_days: reminder_days,
        reminder_date: remDate.toISOString().split('T')[0]
      });
    });

    res.json({ success: true, data: pendingReminders });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/sms-logs', requireAdmin, (req, res) => {
  try {
    const logs = db.prepare('SELECT * FROM sms_logs ORDER BY sent_at DESC').all() || [];
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

async function sendSMSGateway(phone, citizenName, propertyId, message) {
  // Always verify connection dynamically before attempting send to pick up runtime .env edits
  await verifySMSGatewayConnection();

  const fast2smsKey = process.env.FAST2SMS_API_KEY;

  // Normalize phone number to E.164 formatting (specifically Indian phone numbers)
  let formattedPhone = phone.trim().replace(/\s+/g, '').replace(/[-()]/g, '');
  if (/^\d{10}$/.test(formattedPhone)) {
    formattedPhone = '+91' + formattedPhone;
  } else if (/^91\d{10}$/.test(formattedPhone)) {
    formattedPhone = '+' + formattedPhone;
  }

  // Strict E.164 validation (+ followed by 10 to 14 digits)
  const e164Regex = /^\+[1-9]\d{10,14}$/;
  if (!e164Regex.test(formattedPhone)) {
    console.error(`[SMS Gateway] Invalid E.164 phone number format: ${formattedPhone}`);
    return { status: 'Failed', error: `Invalid E.164 phone number format: ${formattedPhone}`, provider: 'None' };
  }

  // If no credentials configured at all, return error
  if (!fast2smsKey || fast2smsKey.trim() === '' || fast2smsKey.includes('YOUR_')) {
    console.error(`[SMS Gateway] Credentials missing.`);
    return { status: 'Failed', error: 'SMS Gateway credentials not configured. Please add FAST2SMS_API_KEY to your environment.', provider: 'None' };
  }

  if (smsGatewayStatus !== 'Connected') {
    return { status: 'Failed', error: 'SMS Gateway is not connected: ' + (smsGatewayError || 'Missing credentials.'), provider: 'None' };
  }

  try {
    const payload = {
      route: 'q',
      message: message,
      language: 'english',
      numbers: formattedPhone
    };
    console.log('[SMS Gateway] Request to Fast2SMS:', {
      url: 'https://www.fast2sms.com/dev/bulkV2',
      method: 'POST',
      headers: {
        'authorization': '***MASKED***',
        'Content-Type': 'application/json'
      },
      body: payload
    });
    const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
      method: 'POST',
      headers: {
        'authorization': fast2smsKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    console.log('[SMS Gateway] Response from Fast2SMS:', result);
    if (result.return) {
      return { 
        status: 'Sent', 
        error: null, 
        responseId: result.request_id || (result.data && result.data[0] && result.data[0].message_id),
        provider: 'Fast2SMS'
      };
    } else {
      console.error('[SMS Gateway] Fast2SMS Error:', result);
      return { status: 'Failed', error: result.message || JSON.stringify(result), provider: 'Fast2SMS' };
    }
  } catch (err) {
    console.error('[SMS Gateway] Fast2SMS Fetch Error:', err);
    return { status: 'Failed', error: err.message, provider: 'Fast2SMS' };
  }
}

app.post('/api/admin/send-reminder', requireAdmin, async (req, res) => {
  const { propertyId, reminderType } = req.body;
  try {
    updateOutdatedTaxStatuses();
    
    // 1. Verify Property ID exists in the database
    const property = db.prepare('SELECT * FROM properties WHERE property_id = ?').get(propertyId);
    if (!property) {
      return res.json({ success: false, message: 'Property ID does not exist.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE property_id = ?').get(propertyId);
    const phone = user ? user.phone : null;
    const name = user ? user.name : property.owner_name || 'Citizen';

    if (!phone) {
      return res.json({ success: false, message: 'Citizen mobile number is not registered.' });
    }
    
    // 2. Verify tax status is Pending or Overdue
    const taxRecord = db.prepare("SELECT * FROM tax_records WHERE property_id = ? AND status IN ('Unpaid', 'Overdue', 'Pending') ORDER BY year DESC LIMIT 1").get(propertyId);
    if (!taxRecord) {
      return res.json({ success: false, message: 'No pending or overdue tax records found for this property.' });
    }

    // 3. Prevent duplicate reminders in the same cycle (same day)
    const duplicate = db.prepare(`
      SELECT COUNT(*) as count FROM sms_logs 
      WHERE property_id = ? AND date(sent_at) = date('now') AND status = 'Sent'
    `).get(propertyId).count > 0;
    
    if (duplicate) {
      return res.json({ success: false, message: 'A tax reminder has already been sent to this citizen today.' });
    }

    // Calculate dynamic status and select message template
    const todayStr = new Date().toISOString().split('T')[0];
    let dueDateStr = taxRecord.due_date;
    if (dueDateStr && dueDateStr.includes('T')) {
      dueDateStr = dueDateStr.split('T')[0];
    }
    const diffTime = new Date(dueDateStr) - new Date(todayStr);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    let calculatedStatus = 'Pending';
    if (todayStr > dueDateStr) {
      calculatedStatus = 'Overdue';
    } else if (diffDays >= 0 && diffDays <= 7) {
      calculatedStatus = 'Near Due Date';
    }
    
    let msg = '';
    let reminderLabel = 'Early Reminder';
    if (calculatedStatus === 'Overdue') {
      reminderLabel = 'Overdue Reminder';
      msg = `Dear ${name},\n\nThis is an overdue reminder that your Property Tax of ₹${parseFloat(taxRecord.tax_amount).toFixed(2)} for Property ID ${propertyId} is OVERDUE.\n\nDue Date: ${taxRecord.due_date}\n\nPlease pay immediately to avoid further penalties.\n\n– Smart Gram Panchayat`;
    } else if (calculatedStatus === 'Near Due Date') {
      reminderLabel = 'Final Reminder';
      msg = `Dear ${name},\n\nThis is a final reminder that your Property Tax of ₹${parseFloat(taxRecord.tax_amount).toFixed(2)} for Property ID ${propertyId} is due soon.\n\nDue Date: ${taxRecord.due_date}\n\nPlease pay immediately to avoid penalties.\n\n– Smart Gram Panchayat`;
    } else {
      reminderLabel = 'Early Reminder';
      msg = `Dear ${name},\n\nThis is an early reminder that your Property Tax of ₹${parseFloat(taxRecord.tax_amount).toFixed(2)} for Property ID ${propertyId} is pending.\n\nDue Date: ${taxRecord.due_date}\n\nPlease pay on time.\n\n– Smart Gram Panchayat`;
    }
    
    const smsResult = await sendSMSGateway(phone, name, propertyId, msg);

    // Save SMS transaction in database
    db.prepare(`
      INSERT INTO sms_logs (property_id, phone, message, status, citizen_name, tax_status, error_message, tax_amount, due_date, gateway_response_id, provider)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(propertyId, phone, msg, smsResult.status, name, getCalculatedTaxStatus(taxRecord), smsResult.error, taxRecord.tax_amount, taxRecord.due_date, smsResult.responseId || null, smsResult.provider || 'None');
    
    if (smsResult.status === 'Sent') {
      // Log in reminders table
      db.prepare(`
        INSERT INTO reminders (property_id, tax_record_id, reminder_type, reminder_days, reminder_date, sent, sent_date, sms_sent)
        VALUES (?, ?, 'Tax Payment', ?, ?, 1, datetime('now'), 1)
      `).run(propertyId, taxRecord.id, reminderLabel, taxRecord.due_date);
      
      // Create citizen dashboard notification
      createNotification(
        propertyId, 'Citizen',
        'Tax Payment Reminder',
        `Tax reminder message sent (${reminderLabel}). Due: ${taxRecord.due_date}`,
        'Tax'
      );
    }

    if (smsResult.status === 'Failed') {
      return res.json({ success: false, message: `Failed to send SMS to ${phone}. Error: ${smsResult.error || 'Unknown Gateway Error'}` });
    }
    
    res.json({ success: true, message: `SMS reminder sent successfully to ${phone}.` });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

app.post('/api/admin/send-bulk-reminder', requireAdmin, async (req, res) => {
  const { reminderType } = req.body;
  try {
    updateOutdatedTaxStatuses();
    const pendingRecords = db.prepare(`
      SELECT tr.*, p.owner_name
      FROM tax_records tr
      JOIN properties p ON tr.property_id = p.property_id
      WHERE tr.status != 'Paid'
    `).all() || [];

    let sentCount = 0;
    const todayStr = new Date().toISOString().split('T')[0];

    for (const record of pendingRecords) {
      const duplicate = db.prepare(`
        SELECT COUNT(*) as count FROM sms_logs 
        WHERE property_id = ? AND date(sent_at) = date('now') AND status = 'Sent'
      `).get(record.property_id).count > 0;
      
      if (duplicate) continue;

      const user = db.prepare('SELECT * FROM users WHERE property_id = ?').get(record.property_id);
      const phone = user ? user.phone : null;
      const name = user ? user.name : record.owner_name || 'Citizen';

      if (!phone) continue;

      // Calculate dynamic status for filtering and message selection
      let dueDateStr = record.due_date;
      if (dueDateStr && dueDateStr.includes('T')) {
        dueDateStr = dueDateStr.split('T')[0];
      }
      const diffTime = new Date(dueDateStr) - new Date(todayStr);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      let calculatedStatus = 'Pending';
      if (todayStr > dueDateStr) {
        calculatedStatus = 'Overdue';
      } else if (diffDays >= 0 && diffDays <= 7) {
        calculatedStatus = 'Near Due Date';
      }

      // Filter by requested reminderType
      let matchesType = false;
      if (reminderType === 'overdue' || reminderType === 'Overdue Reminder') {
        matchesType = (calculatedStatus === 'Overdue');
      } else if (reminderType === '15' || reminderType === '20' || reminderType === 'Final Reminder') {
        matchesType = (calculatedStatus === 'Near Due Date');
      } else if (reminderType === '30' || reminderType === 'Early Reminder') {
        matchesType = (calculatedStatus === 'Pending');
      }

      if (!matchesType) continue;

      let msg = '';
      let reminderLabel = 'Early Reminder';
      if (calculatedStatus === 'Overdue') {
        reminderLabel = 'Overdue Reminder';
        msg = `Dear ${name},\n\nThis is an overdue reminder that your Property Tax of ₹${parseFloat(record.tax_amount).toFixed(2)} for Property ID ${record.property_id} is OVERDUE.\n\nDue Date: ${record.due_date}\n\nPlease pay immediately to avoid further penalties.\n\n– Smart Gram Panchayat`;
      } else if (calculatedStatus === 'Near Due Date') {
        reminderLabel = 'Final Reminder';
        msg = `Dear ${name},\n\nThis is a final reminder that your Property Tax of ₹${parseFloat(record.tax_amount).toFixed(2)} for Property ID ${record.property_id} is due soon.\n\nDue Date: ${record.due_date}\n\nPlease pay immediately to avoid penalties.\n\n– Smart Gram Panchayat`;
      } else {
        reminderLabel = 'Early Reminder';
        msg = `Dear ${name},\n\nThis is an early reminder that your Property Tax of ₹${parseFloat(record.tax_amount).toFixed(2)} for Property ID ${record.property_id} is pending.\n\nDue Date: ${record.due_date}\n\nPlease pay on time.\n\n– Smart Gram Panchayat`;
      }

      const smsResult = await sendSMSGateway(phone, name, record.property_id, msg);
      
      db.prepare(`
        INSERT INTO sms_logs (property_id, phone, message, status, citizen_name, tax_status, error_message, tax_amount, due_date, gateway_response_id, provider)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(record.property_id, phone, msg, smsResult.status, name, getCalculatedTaxStatus(record), smsResult.error, record.tax_amount, record.due_date, smsResult.responseId || null, smsResult.provider || 'None');

      if (smsResult.status === 'Sent') {
        db.prepare(`
          INSERT INTO reminders (property_id, tax_record_id, reminder_type, reminder_days, reminder_date, sent, sent_date, sms_sent)
          VALUES (?, ?, 'Tax Payment', ?, ?, 1, datetime('now'), 1)
        `).run(record.property_id, record.id, reminderLabel, record.due_date);

        createNotification(
          record.property_id, 'Citizen',
          'Tax Payment Reminder',
          `Tax reminder message sent (${reminderLabel}). Due: ${record.due_date}`,
          'Tax'
        );

        sentCount++;
      }
    }

    res.json({ success: true, message: `Sent bulk reminders to ${sentCount} properties successfully!` });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// ==================== CHATBOT API ====================

app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  let propertyId = null;
  if (req.session.user) {
    propertyId = req.session.user.property_id;
  }
  try {
    const services = db.prepare('SELECT * FROM services WHERE status = "Active"').all() || [];
    const schemes = db.prepare('SELECT * FROM government_schemes').all() || [];
    
    const announcements = [
      { title: 'Gram Sabha Meeting', message: 'A meeting is scheduled for tomorrow at 10 AM regarding water supply.' },
      { title: 'Tax Payment Reminder', message: 'Please pay your property taxes before the due date to avoid fines.' }
    ];
    
    let taxInfo = null;
    let complaints = [];
    let property = null;
    let taxRecords = [];
    let notifications = [];
    
    if (propertyId) {
      taxInfo = db.prepare(`
        SELECT tr.*, p.owner_name, p.property_type
        FROM tax_records tr
        JOIN properties p ON tr.property_id = p.property_id
        WHERE tr.property_id = ? AND tr.status != 'Paid'
        ORDER BY tr.year DESC LIMIT 1
      `).get(propertyId);
      complaints = db.prepare('SELECT * FROM complaints WHERE property_id = ?').all() || [];
      property = db.prepare('SELECT * FROM properties WHERE property_id = ?').get(propertyId);
      taxRecords = db.prepare('SELECT * FROM tax_records WHERE property_id = ?').all() || [];
      notifications = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 5').all(propertyId) || [];
    }
    
    const context = {
      services,
      schemes,
      announcements,
      tax_info: taxInfo,
      complaints,
      property,
      tax_records: taxRecords,
      notifications,
      openai_api_key: process.env.OPENAI_API_KEY || null
    };

    // Manage conversation history in session
    if (!req.session.chatHistory) {
      req.session.chatHistory = [];
    }
    req.session.chatHistory.push({ role: 'user', content: message });
    
    // Truncate chat history to last 6 messages
    if (req.session.chatHistory.length > 6) {
      req.session.chatHistory = req.session.chatHistory.slice(-6);
    }

    const tempCtxPath = path.join(__dirname, 'models', `temp_chat_ctx_${req.session.id || 'sess'}_${Date.now()}.json`);
    const payload = {
      query: message,
      context: context,
      history: req.session.chatHistory
    };
    fs.writeFileSync(tempCtxPath, JSON.stringify(payload, null, 2), 'utf8');

    const cmd = `python ml/chatbot.py --config_path "${tempCtxPath}"`;
    exec(cmd, (error, stdout, stderr) => {
      // delete temp file safely
      try {
        fs.unlinkSync(tempCtxPath);
      } catch (e) {}

      if (error) {
        console.error("Chatbot processing error:", stderr || error.message);
        return res.json({ success: false, reply: "I am having trouble processing your query right now. Please try again." });
      }
      const reply = stdout.trim();
      req.session.chatHistory.push({ role: 'assistant', content: reply });
      res.json({ success: true, reply });
    });
  } catch (error) {
    res.json({ success: false, reply: "Chatbot error: " + error.message });
  }
});

// ==================== START SERVER ====================

db.init().then(() => {
  console.log('✓ Wasm SQLite database initialized successfully.');
  updateOutdatedTaxStatuses();
  verifySMSGatewayConnection();
  app.listen(PORT, () => {
    console.log(`✓ Smart Gram Panchayat Management System running at http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize SQLite database:', err);
});
