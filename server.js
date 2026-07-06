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

const app = express();
const PORT = process.env.PORT || 3000;

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
    const unpaidTaxes = db.prepare("SELECT COUNT(*) as count FROM tax_records WHERE property_id = ? AND status IN ('Unpaid', 'Overdue')").get(record.property_id).count || 0;
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
    const totalCollection = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM payments
    `).get() || { total: 0 };

    const pendingCount = db.prepare(`
      SELECT COUNT(*) as count FROM tax_records WHERE status = 'Unpaid'
    `).get() || { count: 0 };

    const totalProperties = db.prepare(`
      SELECT COUNT(*) as count FROM properties
    `).get() || { count: 0 };

    const schemes = db.prepare('SELECT * FROM government_schemes').all() || [];
    const services = db.prepare('SELECT * FROM services WHERE status = "Active" LIMIT 4').all() || [];

    res.render('index', {
      stats: {
        collection: totalCollection.total || 0,
        pending: pendingCount.count || 0,
        properties: totalProperties.count || 0
      },
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
    
    // For each Unpaid record, calculate ML defaulter risk if not already set
    for (let record of results) {
      if (record.status === 'Unpaid' && record.predicted_status === 'Low Risk' && record.payment_probability === 100.0) {
        try {
          const totalTaxes = db.prepare('SELECT COUNT(*) as count FROM tax_records WHERE property_id = ?').get(record.property_id).count;
          const unpaidTaxes = db.prepare("SELECT COUNT(*) as count FROM tax_records WHERE property_id = ? AND status = 'Unpaid'").get(record.property_id).count;
          const history_paid_ratio = totalTaxes > 0 ? (totalTaxes - unpaidTaxes) / totalTaxes : 1.0;
          const late_payments = unpaidTaxes;

          const mlResult = await runMLInference('--predict-defaulter', {
            property_type: record.property_type,
            tax_amount: record.tax_amount,
            year: record.year,
            history_paid_ratio,
            late_payments
          });

          record.predicted_status = mlResult.risk;
          record.payment_probability = mlResult.probability;
          record.xai_explanation = mlResult.reasons.join(' | ');

          db.prepare(`
            UPDATE tax_records 
            SET predicted_status = ?, payment_probability = ?, xai_explanation = ?
            WHERE id = ?
          `).run(mlResult.risk, mlResult.probability, mlResult.reasons.join(' | '), record.id);
        } catch (mlErr) {
          console.error("Realtime Defaulter ML error:", mlErr.message);
        }
      }
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

    res.json({ 
      success: true, 
      message: 'Payment successful!',
      transactionId: txnId 
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
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
    // Check if username already exists
    const existingUsername = db.prepare('SELECT COUNT(*) as count FROM users WHERE LOWER(username) = LOWER(?)').get(username).count;
    if (existingUsername > 0) {
      const properties = db.prepare('SELECT property_id, owner_name FROM properties ORDER BY property_id ASC').all() || [];
      return res.render('user-register', {
        session: req.session,
        properties,
        error: 'Username is already taken.',
        success: null
      });
    }

    // Check if property is already registered
    const existingProperty = db.prepare('SELECT COUNT(*) as count FROM users WHERE property_id = ?').get(propertyId).count;
    if (existingProperty > 0) {
      const properties = db.prepare('SELECT property_id, owner_name FROM properties ORDER BY property_id ASC').all() || [];
      return res.render('user-register', {
        session: req.session,
        properties,
        error: 'This Property ID is already linked to another registered citizen.',
        success: null
      });
    }

    // Set reasonable defaults for demographics
    let income = 80000.0;
    let land_size = 1.5;
    let is_farmer = (occupation === 'Agriculture') ? 1 : 0;
    let is_student = (occupation === 'Student') ? 1 : 0;
    let disability = 0;

    // Save permanently in the database
    db.prepare(`
      INSERT INTO users (property_id, name, phone, email, password, age, gender, occupation, income, land_size, is_farmer, is_student, disability, address, ward, aadhaar, username)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(propertyId, name, phone, email, password, parseInt(age), gender, occupation, income, land_size, is_farmer, is_student, disability, address, ward, aadhaar || null, username);

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
      error: 'Error: ' + err.message,
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
  
  const user = req.session.user;
    const property = db.prepare('SELECT * FROM properties WHERE property_id = ?').get(user.property_id);
  const taxRecords = db.prepare('SELECT * FROM tax_records WHERE property_id = ? ORDER BY year DESC').all(user.property_id) || [];
  const payments = db.prepare('SELECT * FROM payments WHERE property_id = ? ORDER BY payment_date DESC').all(user.property_id) || [];
  const complaints = db.prepare('SELECT * FROM complaints WHERE property_id = ? ORDER BY created_at DESC').all(user.property_id) || [];
  const notifications = db.prepare('SELECT * FROM notifications WHERE (user_id = ? OR role = "Citizen") ORDER BY created_at DESC LIMIT 10').all(user.property_id) || [];
  
  // Fetch appointments, schemes, and services
  const appointments = db.prepare(`
    SELECT a.*, tr.year, tr.tax_amount 
    FROM appointments a 
    JOIN tax_records tr ON a.tax_record_id = tr.id 
    WHERE a.property_id = ? 
    ORDER BY a.appointment_date DESC
  `).all(user.property_id) || [];
  
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
    appointments,
    services,
    schemes
  });
});

// ==================== APPOINTMENT ENDPOINTS ====================

app.post('/api/appointments/book', async (req, res) => {
  if (!req.session.user) {
    return res.json({ success: false, error: 'Unauthorized login required.' });
  }
  const { taxRecordId, appointmentDate, appointmentTime } = req.body;
  const propertyId = req.session.user.property_id;

  try {
    // 1. Check if the corresponding tax record is already 'Paid'
    const taxRecord = db.prepare('SELECT * FROM tax_records WHERE id = ?').get(taxRecordId);
    if (!taxRecord) {
      return res.json({ success: false, error: 'Tax record not found.' });
    }
    if (taxRecord.status === 'Paid') {
      return res.json({ success: false, error: 'This tax record is already Paid. Booking is disabled.' });
    }

    // 2. Check if there is already an active appointment (status = 'Pending' or 'Approved') for the same tax record
    const activeAppt = db.prepare("SELECT * FROM appointments WHERE tax_record_id = ? AND status IN ('Pending', 'Approved')").get(taxRecordId);
    if (activeAppt) {
      return res.json({ success: false, error: 'An active appointment already exists for this tax record.' });
    }

    // 3. Check if the selected date and time slot is already booked (double-booking prevention)
    const slotBooked = db.prepare("SELECT * FROM appointments WHERE appointment_date = ? AND appointment_time = ? AND status IN ('Pending', 'Approved')").get(appointmentDate, appointmentTime);
    if (slotBooked) {
      return res.json({ success: false, error: 'The selected date and time slot is already booked. Please choose another.' });
    }

    // 4. Save the appointment in the SQLite database
    db.prepare(`
      INSERT INTO appointments (property_id, tax_record_id, appointment_date, appointment_time, status)
      VALUES (?, ?, ?, ?, 'Pending')
    `).run(propertyId, taxRecordId, appointmentDate, appointmentTime);
    saveDatabase();

    // 5. Notify the citizen and admin
    createNotification(
      propertyId, 'Citizen',
      'Appointment Booked',
      `Your tax payment appointment for ${appointmentDate} at ${appointmentTime} is requested and pending approval.`,
      'Tax'
    );

    createNotification(
      'admin', 'Admin',
      'New Appointment Request',
      `Citizen has scheduled an appointment for Property ID ${propertyId} on ${appointmentDate} at ${appointmentTime}.`,
      'System'
    );

    res.json({ success: true, message: 'Appointment booked successfully!' });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/appointments/reschedule', async (req, res) => {
  if (!req.session.user) {
    return res.json({ success: false, error: 'Unauthorized login required.' });
  }
  const { appointmentId, newDate, newTime } = req.body;
  const propertyId = req.session.user.property_id;

  try {
    const appt = db.prepare('SELECT * FROM appointments WHERE id = ? AND property_id = ?').get(appointmentId, propertyId);
    if (!appt) {
      return res.json({ success: false, error: 'Appointment not found or unauthorized.' });
    }

    // Only allow rescheduling before approval (or allow anytime if pending/approved)
    if (appt.status !== 'Pending' && appt.status !== 'Approved') {
      return res.json({ success: false, error: 'Only pending or approved appointments can be rescheduled.' });
    }

    // Check if the selected date and time slot is already booked
    const slotBooked = db.prepare("SELECT * FROM appointments WHERE appointment_date = ? AND appointment_time = ? AND id != ? AND status IN ('Pending', 'Approved')").get(newDate, newTime, appointmentId);
    if (slotBooked) {
      return res.json({ success: false, error: 'The selected date and time slot is already booked. Please choose another.' });
    }

    db.prepare(`
      UPDATE appointments 
      SET appointment_date = ?, appointment_time = ?, status = 'Pending'
      WHERE id = ?
    `).run(newDate, newTime, appointmentId);
    saveDatabase();

    createNotification(
      propertyId, 'Citizen',
      'Appointment Rescheduled',
      `Your appointment was rescheduled to ${newDate} at ${newTime} (Pending approval).`,
      'Tax'
    );

    createNotification(
      'admin', 'Admin',
      'Appointment Rescheduled',
      `Property ID ${propertyId} rescheduled appointment to ${newDate} at ${newTime}.`,
      'System'
    );

    res.json({ success: true, message: 'Appointment rescheduled successfully!' });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/appointments/cancel', async (req, res) => {
  if (!req.session.user) {
    return res.json({ success: false, error: 'Unauthorized login required.' });
  }
  const { appointmentId } = req.body;
  const propertyId = req.session.user.property_id;

  try {
    const appt = db.prepare('SELECT * FROM appointments WHERE id = ? AND property_id = ?').get(appointmentId, propertyId);
    if (!appt) {
      return res.json({ success: false, error: 'Appointment not found.' });
    }

    if (appt.status !== 'Pending' && appt.status !== 'Approved') {
      return res.json({ success: false, error: 'Only pending or approved appointments can be cancelled.' });
    }

    db.prepare(`
      UPDATE appointments SET status = 'Cancelled' WHERE id = ?
    `).run(appointmentId);
    saveDatabase();

    createNotification(
      propertyId, 'Citizen',
      'Appointment Cancelled',
      `Your offline tax payment appointment scheduled for ${appt.appointment_date} has been cancelled.`,
      'Tax'
    );

    createNotification(
      'admin', 'Admin',
      'Appointment Cancelled',
      `Appointment for Property ID ${propertyId} on ${appt.appointment_date} was cancelled by the citizen.`,
      'System'
    );

    res.json({ success: true, message: 'Appointment cancelled successfully!' });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

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

    const insertResult = db.prepare(`
      INSERT INTO complaints (property_id, category, description, ward, priority, predicted_priority, predicted_category, confidence_score, is_duplicate, duplicate_of_id, xai_explanation)
      VALUES (?, ?, ?, ?, 'Medium', 'Medium', ?, ?, 0, NULL, 'Grievance lodged in Panchayat records.')
    `).run(propertyId, category, description, ward, predictedCategory, catConfidence);
    const complaintId = insertResult.lastInsertRowid;

    let priority = 'Medium';
    let isDuplicate = 0;
    let duplicateOfId = null;
    let xaiExplanation = 'Grievance lodged in Panchayat records.';

    try {
      const existing = db.prepare(`
        SELECT id, description FROM complaints
        WHERE category = ? AND ward = ? AND status != 'Resolved' AND id != ?
      `).all(predictedCategory, ward, complaintId) || [];


      const dupResult = await runMLInference('--detect-duplicate', {
        description,
        category,
        existing
      });

      if (dupResult.is_duplicate) {
        isDuplicate = 1;
        duplicateOfId = dupResult.duplicate_of_id;
        
        createNotification(
          'admin', 'Admin',
          'Duplicate Complaint Detected',
          `Property ${propertyId} filed a duplicate complaint of ID ${duplicateOfId} (${dupResult.similarity * 100}% similarity).`,
          'Duplicate'
        );
      }

      const similarCount = existing.length;

      const prioResult = await runMLInference('--predict-priority', {
        description,
        category,
        ward,
        similar_count: similarCount,
        is_duplicate: isDuplicate
      });

      priority = prioResult.priority;
      const confidence = prioResult.confidence;
      xaiExplanation = prioResult.reasons.join(' | ');

      if (complaintId) {
        db.prepare(`
          UPDATE complaints
          SET priority = ?, predicted_priority = ?, confidence_score = ?, is_duplicate = ?, duplicate_of_id = ?, xai_explanation = ?
          WHERE id = ?
        `).run(priority, priority, confidence, isDuplicate, duplicateOfId, xaiExplanation, complaintId);
      }

      if (priority === 'High') {
        createNotification(
          'admin', 'Admin',
          'High Priority Complaint Alert',
          `A High Priority complaint has been submitted: "${description.substring(0, 60)}..." in ${ward}.`,
          'Alert'
        );
      }
    } catch (mlErr) {
      console.error("Non-blocking ML Prediction failed:", mlErr.message);
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
  if (username === 'admin' && password === 'admin123') {
    req.session.admin = true;
    res.redirect('/admin-dashboard');
  } else {
    res.render('admin-login', { session: req.session, error: 'Invalid credentials' });
  }
});



app.get('/admin-logout', (req, res) => {
  req.session.admin = false;
  res.redirect('/');
});

app.get('/admin-dashboard', requireAdmin, (req, res) => {
  try {
    const totalCollection = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM payments
    `).get() || { total: 0 };

    const pendingCount = db.prepare(`
      SELECT COUNT(*) as count FROM tax_records WHERE status = 'Unpaid'
    `).get() || { count: 0 };

    const totalProperties = db.prepare(`
      SELECT COUNT(*) as count FROM properties
    `).get() || { count: 0 };

    const totalCitizens = db.prepare(`
      SELECT COUNT(*) as count FROM users
    `).get() || { count: 0 };

    const todayDate = new Date().toISOString().split('T')[0];
    const todayAppointments = db.prepare(`
      SELECT COUNT(*) as count FROM appointments WHERE appointment_date = ?
    `).get(todayDate) || { count: 0 };

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
    const unpaidTaxes = db.prepare('SELECT predicted_status FROM tax_records WHERE status = "Unpaid"').all() || [];
    const defaultRiskDist = { "High Risk": 0, "Medium Risk": 0, "Low Risk": 0 };
    unpaidTaxes.forEach(t => {
      defaultRiskDist[t.predicted_status] = (defaultRiskDist[t.predicted_status] || 0) + 1;
    });

    const highRiskDefaulters = db.prepare(`
      SELECT tr.*, p.owner_name, p.phone
      FROM tax_records tr
      JOIN properties p ON tr.property_id = p.property_id
      WHERE tr.status = 'Unpaid' AND tr.predicted_status = 'High Risk'
      ORDER BY tr.payment_probability DESC LIMIT 5
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
  const taxRecords = db.prepare(`
    SELECT tr.*, p.owner_name, p.property_type
    FROM tax_records tr
    JOIN properties p ON tr.property_id = p.property_id
    ORDER BY tr.created_at DESC
  `).all() || [];

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
    `).run(category, priority, id);
    res.json({ success: true });
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
          db.prepare('UPDATE complaints SET status = ?, admin_remarks = ? WHERE id = ?').run('Resolved', `Resolved via link to Original Complaint #${id}: ${remarks || 'None'}.`, dup.id);
          
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
      const unpaidTaxes = db.prepare("SELECT COUNT(*) as count FROM tax_records WHERE property_id = ? AND status = 'Unpaid'").get(t.property_id).count || 0;
      const totalTaxes = db.prepare('SELECT COUNT(*) as count FROM tax_records WHERE property_id = ?').get(t.property_id).count || 0;
      const history_paid_ratio = totalTaxes > 0 ? (totalTaxes - unpaidTaxes) / totalTaxes : 1.0;
      return {
        id: `T_DB_${t.id}`,
        property_type: t.property_type.toLowerCase() === 'commercial' ? 1 : 0,
        tax_amount: t.tax_amount,
        year: t.year,
        history_paid_ratio: parseFloat(history_paid_ratio.toFixed(2)),
        late_payments: unpaidTaxes,
        is_defaulter: t.status === 'Unpaid' ? 1 : 0
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

app.get('/admin-appointments', requireAdmin, (req, res) => {
  try {
    const appointments = db.prepare(`
      SELECT a.*, p.owner_name as name, tr.year, tr.tax_amount 
      FROM appointments a
      JOIN properties p ON a.property_id = p.property_id
      JOIN tax_records tr ON a.tax_record_id = tr.id
      ORDER BY a.appointment_date DESC
    `).all() || [];

    const pending = db.prepare("SELECT COUNT(*) as count FROM appointments WHERE status = 'Pending'").get().count || 0;
    const approved = db.prepare("SELECT COUNT(*) as count FROM appointments WHERE status = 'Approved'").get().count || 0;
    const completed = db.prepare("SELECT COUNT(*) as count FROM appointments WHERE status = 'Completed'").get().count || 0;
    const cancelled = db.prepare("SELECT COUNT(*) as count FROM appointments WHERE status IN ('Cancelled', 'Rejected')").get().count || 0;

    res.render('admin-appointments', {
      session: req.session,
      appointments,
      stats: { pending, approved, completed, cancelled }
    });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.post('/api/admin/update-appointment', requireAdmin, async (req, res) => {
  const { appointmentId, status, newDate, newTime } = req.body;

  try {
    const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(appointmentId);
    if (!appt) {
      return res.json({ success: false, error: 'Appointment not found.' });
    }

    if (newDate && newTime) {
      // Admin rescheduling the slot
      const slotBooked = db.prepare("SELECT * FROM appointments WHERE appointment_date = ? AND appointment_time = ? AND id != ? AND status IN ('Pending', 'Approved')").get(newDate, newTime, appointmentId);
      if (slotBooked) {
        return res.json({ success: false, error: 'The selected slot is already booked.' });
      }

      db.prepare(`
        UPDATE appointments 
        SET appointment_date = ?, appointment_time = ?, status = ?
        WHERE id = ?
      `).run(newDate, newTime, status, appointmentId);
      saveDatabase();

      createNotification(
        appt.property_id, 'Citizen',
        'Appointment Rescheduled by Admin',
        `Your appointment has been rescheduled to ${newDate} at ${newTime} (Status: ${status}).`,
        'Tax'
      );

      return res.json({ success: true, message: 'Appointment rescheduled and updated successfully!' });
    }

    // Standard status update
    if (status === 'Completed') {
      const taxRecord = db.prepare('SELECT * FROM tax_records WHERE id = ?').get(appt.tax_record_id);
      if (!taxRecord) {
        return res.json({ success: false, error: 'Corresponding tax record not found.' });
      }

      // Update tax to Paid and reset risk
      db.prepare("UPDATE tax_records SET status = 'Paid', predicted_status = 'No Risk', payment_probability = 0.0 WHERE id = ?").run(appt.tax_record_id);

      // Record payment
      const txnId = generateTransactionId();
      db.prepare(`
        INSERT INTO payments (property_id, tax_record_id, amount, transaction_id)
        VALUES (?, ?, ?, ?)
      `).run(appt.property_id, appt.tax_record_id, taxRecord.tax_amount, txnId);

      // Update appointment status
      db.prepare("UPDATE appointments SET status = 'Completed' WHERE id = ?").run(appointmentId);
      saveDatabase();

      // Notify citizen
      createNotification(
        appt.property_id, 'Citizen',
        'Payment Completed',
        `Your offline tax payment of ₹${taxRecord.tax_amount.toLocaleString('en-IN')} for Property ID ${appt.property_id} has been processed successfully. Your appointment is completed. Thank you.`,
        'Tax'
      );

      // Notify admin
      createNotification(
        'admin', 'Admin',
        'Appointment Completed',
        `Appointment for Property ID ${appt.property_id} has been completed and payment processed.`,
        'System'
      );
    } else {
      // Just approve / reject / cancel
      db.prepare("UPDATE appointments SET status = ? WHERE id = ?").run(status, appointmentId);
      saveDatabase();

      createNotification(
        appt.property_id, 'Citizen',
        `Appointment ${status}`,
        `Your offline tax payment appointment is now ${status}.`,
        'Tax'
      );
    }

    res.json({ success: true, message: `Appointment marked as '${status}' successfully!` });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

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

app.post('/api/admin/add-tax', requireAdmin, (req, res) => {
  const { propertyId, taxAmount, dueDate, year, ownerName } = req.body;
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
      VALUES (?, ?, ?, ?, 'Unpaid')
    `).run(propertyId.toUpperCase(), parseFloat(taxAmount), dueDate, parseInt(year));
    
    await recalculateTaxML(insertResult.lastInsertRowid);
    
    res.json({ success: true, message: 'Tax record saved successfully!' });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

app.post('/api/admin/update-tax', requireAdmin, (req, res) => {
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

app.get('/admin-reminders', requireAdmin, (req, res) => {
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_PHONE_NUMBER;
  const fast2smsKey = process.env.FAST2SMS_API_KEY;
  const isRealSMS = !!((twilioSid && twilioAuthToken && twilioFrom && twilioSid.trim() !== '' && !twilioSid.includes('YOUR_')) || (fast2smsKey && fast2smsKey.trim() !== '' && !fast2smsKey.includes('YOUR_')));
  res.render('admin-reminders', { session: req.session, isRealSMS });
});

app.get('/api/admin/pending-reminders', requireAdmin, (req, res) => {
  try {
    const unpaid = db.prepare(`
      SELECT tr.*, p.owner_name
      FROM tax_records tr
      JOIN properties p ON tr.property_id = p.property_id
      WHERE tr.status != 'Paid'
    `).all() || [];

    const pendingReminders = [];
    const currentDate = new Date();
    
    unpaid.forEach(record => {
      const dueDate = new Date(record.due_date);
      const diffTime = dueDate.getTime() - currentDate.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      let reminder_days = 30;
      if (diffDays <= 0) {
        reminder_days = 'overdue';
      } else if (diffDays <= 15) {
        reminder_days = 15;
      } else if (diffDays <= 20) {
        reminder_days = 20;
      } else {
        reminder_days = 30;
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
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_PHONE_NUMBER;
  const fast2smsKey = process.env.FAST2SMS_API_KEY;

  if (twilioSid && twilioAuthToken && twilioFrom && twilioSid.trim() !== '' && !twilioSid.includes('YOUR_')) {
    try {
      const auth = Buffer.from(`${twilioSid}:${twilioAuthToken}`).toString('base64');
      const params = new URLSearchParams({
        To: phone,
        From: twilioFrom,
        Body: message
      });
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });
      const result = await response.json();
      if (response.ok) {
        return { status: 'Sent', error: null };
      } else {
        console.error('Twilio Error:', result);
        return { status: 'Failed', error: result.message || JSON.stringify(result) };
      }
    } catch (err) {
      console.error('Twilio Fetch Error:', err);
      return { status: 'Failed', error: err.message };
    }
  } else if (fast2smsKey && fast2smsKey.trim() !== '' && !fast2smsKey.includes('YOUR_')) {
    try {
      const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: {
          'authorization': fast2smsKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          route: 'q',
          message: message,
          language: 'english',
          numbers: phone
        })
      });
      const result = await response.json();
      if (result.return) {
        return { status: 'Sent', error: null };
      } else {
        console.error('Fast2SMS Error:', result);
        return { status: 'Failed', error: result.message || JSON.stringify(result) };
      }
    } catch (err) {
      console.error('Fast2SMS Fetch Error:', err);
      return { status: 'Failed', error: err.message };
    }
  }


  console.log(`[SMS SIMULATION] To: ${phone} | Citizen: ${citizenName} | Property: ${propertyId} | Msg:\n${message}`);
  return { status: 'Simulation', error: null };
}

app.post('/api/admin/send-reminder', requireAdmin, async (req, res) => {
  const { propertyId, reminderType } = req.body;
  try {
    const user = db.prepare('SELECT * FROM users WHERE property_id = ?').get(propertyId);
    const phone = user ? user.phone : '9876543210';
    const name = user ? user.name : 'Citizen';
    
    const taxRecord = db.prepare("SELECT * FROM tax_records WHERE property_id = ? AND status != 'Paid' ORDER BY year DESC LIMIT 1").get(propertyId);
    if (!taxRecord) {
      return res.json({ success: false, message: 'No pending tax records found for this property.' });
    }

    const msg = `Dear ${name},

Our records show that your Gram Panchayat Property Tax for Property ID ${propertyId} is pending.

Please log in to the Smart Gram Panchayat application to view the outstanding amount, due date, and payment details.

To make an offline payment, please schedule an appointment through the application or contact the Gram Panchayat Office.

Thank you.`;
    
    const smsResult = await sendSMSGateway(phone, name, propertyId, msg);

    db.prepare(`
      INSERT INTO sms_logs (property_id, phone, message, status, citizen_name, tax_status, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(propertyId, phone, msg, smsResult.status, name, taxRecord.status, smsResult.error);
    
    // Also log in reminders table
    db.prepare(`
      INSERT INTO reminders (property_id, tax_record_id, reminder_type, reminder_days, reminder_date, sent, sent_date, sms_sent)
      VALUES (?, ?, 'Tax Payment', ?, ?, 1, datetime('now'), 1)
    `).run(propertyId, taxRecord.id, reminderType, taxRecord.due_date);
    
    // Create citizen dashboard notification
    createNotification(
      propertyId, 'Citizen',
      'Tax Payment Reminder',
      `Tax reminder message sent (Status: ${smsResult.status}). Due: ${taxRecord.due_date}`,
      'Tax'
    );

    res.json({ success: true, message: `SMS reminder sent successfully to ${phone} (Status: ${smsResult.status})!` });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});


app.post('/api/admin/send-bulk-reminder', requireAdmin, async (req, res) => {
  const { reminderType } = req.body;
  try {
    const pendingRecords = db.prepare(`
      SELECT tr.*, p.owner_name
      FROM tax_records tr
      JOIN properties p ON tr.property_id = p.property_id
      WHERE tr.status != 'Paid'
    `).all() || [];

    let sentCount = 0;

    for (const record of pendingRecords) {
      // Prevent duplicate SMS reminders from being sent repeatedly on the same day in bulk mode
      const duplicate = db.prepare(`
        SELECT COUNT(*) as count FROM sms_logs 
        WHERE property_id = ? AND date(sent_at) = date('now')
      `).get(record.property_id).count > 0;
      
      if (duplicate) continue;

      const user = db.prepare('SELECT * FROM users WHERE property_id = ?').get(record.property_id);
      const phone = user ? user.phone : '9876543210';
      const name = user ? user.name : record.owner_name || 'Citizen';

      const msg = `Dear ${name},

Our records show that your Gram Panchayat Property Tax for Property ID ${record.property_id} is pending.

Please log in to the Smart Gram Panchayat application to view the outstanding amount, due date, and payment details.

To make an offline payment, please schedule an appointment through the application or contact the Gram Panchayat Office.

Thank you.`;

      const smsResult = await sendSMSGateway(phone, name, record.property_id, msg);

      db.prepare(`
        INSERT INTO sms_logs (property_id, phone, message, status, citizen_name, tax_status, error_message)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(record.property_id, phone, msg, smsResult.status, name, record.status, smsResult.error);

      db.prepare(`
        INSERT INTO reminders (property_id, tax_record_id, reminder_type, reminder_days, reminder_date, sent, sent_date, sms_sent)
        VALUES (?, ?, 'Tax Payment', ?, ?, 1, datetime('now'), 1)
      `).run(record.property_id, record.id, reminderType, record.due_date);

      createNotification(
        record.property_id, 'Citizen',
        'Tax Payment Reminder',
        `Tax reminder message sent (Status: ${smsResult.status}). Due: ${record.due_date}`,
        'Tax'
      );

      sentCount++;
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
    const services = db.prepare('SELECT title, description, eligibility, benefits FROM services WHERE status = "Active"').all() || [];
    const schemes = db.prepare('SELECT title, target_criteria, benefits, eligibility FROM government_schemes').all() || [];
    
    const announcements = [
      { title: 'Gram Sabha Meeting', message: 'A meeting is scheduled for tomorrow at 10 AM regarding water supply.' },
      { title: 'Tax Payment Reminder', message: 'Please pay your property taxes before the due date to avoid fines.' }
    ];
    
    let taxInfo = null;
    let appointments = [];
    let complaints = [];
    let property = null;
    let taxRecords = [];
    
    if (propertyId) {
      taxInfo = db.prepare(`
        SELECT tr.*, p.owner_name, p.property_type
        FROM tax_records tr
        JOIN properties p ON tr.property_id = p.property_id
        WHERE tr.property_id = ? AND tr.status = 'Unpaid'
        ORDER BY tr.year DESC LIMIT 1
      `).get(propertyId);

      appointments = db.prepare('SELECT * FROM appointments WHERE property_id = ?').all() || [];
      complaints = db.prepare('SELECT * FROM complaints WHERE property_id = ?').all() || [];
      property = db.prepare('SELECT * FROM properties WHERE property_id = ?').get(propertyId);
      taxRecords = db.prepare('SELECT * FROM tax_records WHERE property_id = ?').all() || [];
    }
    
    const context = {
      services,
      schemes,
      announcements,
      tax_info: taxInfo,
      appointments,
      complaints,
      property,
      tax_records: taxRecords,
      gemini_api_key: process.env.GEMINI_API_KEY || null
    };

    const escapedQuery = message.replace(/"/g, '\\"').replace(/\n/g, ' ');
    const escapedContext = JSON.stringify(context).replace(/"/g, '\\"');
    
    const cmd = `python ml/chatbot.py --query "${escapedQuery}" --context "${escapedContext}"`;
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error("Chatbot processing error:", stderr || error.message);
        return res.json({ success: false, reply: "I am having trouble processing your query right now. Please try again." });
      }
      res.json({ success: true, reply: stdout.trim() });
    });
  } catch (error) {
    res.json({ success: false, reply: "Chatbot error: " + error.message });
  }
});

// ==================== START SERVER ====================

db.init().then(() => {
  console.log('✓ Wasm SQLite database initialized successfully.');
  app.listen(PORT, () => {
    console.log(`✓ Smart Gram Panchayat Management System running at http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize SQLite database:', err);
});
