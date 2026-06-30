const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
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

// Home page
app.get('/', (req, res) => {
  res.locals.page = 'home';
  const totalCollection = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM payments
  `).get() || { total: 0 };

  const pendingCount = db.prepare(`
    SELECT COUNT(*) as count FROM tax_records WHERE status = 'Unpaid'
  `).get() || { count: 0 };

  const totalProperties = db.prepare(`
    SELECT COUNT(*) as count FROM properties
  `).get() || { count: 0 };

  res.render('index', {
    stats: {
      collection: totalCollection.total || 0,
      pending: pendingCount.count || 0,
      properties: totalProperties.count || 0
    },
    session: req.session
  });
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
    db.prepare('UPDATE tax_records SET status = "Paid" WHERE id = ?').run(taxId);
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
      UPDATE tax_records SET status = 'Paid' WHERE id = ?
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
  const { propertyId, phone } = req.body;

  const user = db.prepare(`
    SELECT * FROM users WHERE property_id = ? AND phone = ?
  `).get(propertyId.toUpperCase(), phone);

  if (user) {
    req.session.user = user;
    res.redirect('/user-dashboard');
  } else {
    res.render('user-login', { 
      session: req.session, 
      error: 'Invalid Property ID or Registered Mobile Number' 
    });
  }
});

app.get('/user-logout', (req, res) => {
  req.session.user = null;
  res.redirect('/user-login');
});

// Citizen dashboard (with scheme recommendations)
app.get('/user-dashboard', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/user-login');
  }
  
  const user = req.session.user;
  
  const property = db.prepare('SELECT * FROM properties WHERE property_id = ?').get(user.property_id);
  const taxRecords = db.prepare('SELECT * FROM tax_records WHERE property_id = ? ORDER BY year DESC').all() || [];
  const payments = db.prepare('SELECT * FROM payments WHERE property_id = ? ORDER BY payment_date DESC').all() || [];
  const complaints = db.prepare('SELECT * FROM complaints WHERE property_id = ? ORDER BY created_at DESC').all() || [];
  const notifications = db.prepare('SELECT * FROM notifications WHERE (user_id = ? OR role = "Citizen") ORDER BY created_at DESC LIMIT 10').all() || [];
  
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
    recommendedSchemes
  });
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
  }
  const { category, description, ward } = req.body;
  const propertyId = req.session.user.property_id;

  try {
    // 1. Commit complaint to database immediately (Standard fallback values)
    db.prepare(`
      INSERT INTO complaints (property_id, category, description, ward, priority, predicted_priority, predicted_category, confidence_score, is_duplicate, duplicate_of_id, xai_explanation)
      VALUES (?, ?, ?, ?, 'Medium', 'Medium', ?, 1.0, 0, NULL, 'Grievance lodged in Panchayat records.')
    `).run(propertyId, category, description, ward, category);

    // Retrieve last inserted record row ID
    const lastRow = db.prepare('SELECT id FROM complaints WHERE property_id = ? ORDER BY id DESC LIMIT 1').get(propertyId);
    const complaintId = lastRow ? lastRow.id : null;

    // Default return payload
    let priority = 'Medium';
    let isDuplicate = 0;
    let duplicateOfId = null;
    let xaiExplanation = 'Grievance lodged in Panchayat records.';

    // 2. Wrap ML predictions and similarity calculations in an auxiliary try-catch
    try {
      const existing = db.prepare(`
        SELECT id, description FROM complaints
        WHERE category = ? AND status != 'Resolved' AND id != ?
      `).all(category, complaintId) || [];

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

      const prioResult = await runMLInference('--predict-priority', {
        description,
        category,
        ward
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
  res.redirect('/admin-login');
});

// Admin dashboard
app.get('/admin-dashboard', requireAdmin, (req, res) => {
  const totalCollection = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM payments
  `).get() || { total: 0 };

  const pendingCount = db.prepare(`
    SELECT COUNT(*) as count FROM tax_records WHERE status = 'Unpaid'
  `).get() || { count: 0 };

  const totalProperties = db.prepare(`
    SELECT COUNT(*) as count FROM properties
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

  res.render('admin-dashboard', {
    session: req.session,
    stats: {
      collection: totalCollection.total || 0,
      pending: pendingCount.count || 0,
      properties: totalProperties.count || 0
    },
    recentPayments,
    alerts,
    mlMeta,
    charts: {
      priorityDist,
      catDist,
      defaultRiskDist,
      duplicatesCount
    }
  });
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
  const { propertyId, name, phone, email, password, age, gender, occupation, income, landSize, isFarmer, isStudent, disability } = req.body;
  if (!propertyId || !name || !phone) {
    return res.json({ success: false, message: 'Property ID, Name, and Phone are required.' });
  }
  try {
    db.prepare(`
      INSERT INTO users (property_id, name, phone, email, password, age, gender, occupation, income, land_size, is_farmer, is_student, disability)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      propertyId.toUpperCase(), name, phone, email || '', password || 'user123',
      parseInt(age) || 30, gender || 'Male', occupation || 'Agriculture',
      parseFloat(income) || 80000.0, parseFloat(landSize) || 1.5,
      parseInt(isFarmer) || 0, parseInt(isStudent) || 0, parseInt(disability) || 0
    );
    res.json({ success: true, message: 'Citizen profile registered successfully!' });
  } catch (e) {
    let msg = e.message;
    if (msg.includes('UNIQUE constraint failed: users.property_id')) {
      msg = `This Property ID (${propertyId.toUpperCase()}) is already registered to another citizen profile.`;
    }
    res.json({ success: false, message: msg });
  }
});

app.post('/api/admin/update-citizen', requireAdmin, (req, res) => {
  const { id, name, phone, email, age, gender, occupation, income, landSize, isFarmer, isStudent, disability } = req.body;
  try {
    db.prepare(`
      UPDATE users 
      SET name = ?, phone = ?, email = ?, age = ?, gender = ?, occupation = ?, income = ?, land_size = ?, is_farmer = ?, is_student = ?, disability = ?
      WHERE id = ?
    `).run(
      name, phone, email, parseInt(age), gender, occupation,
      parseFloat(income), parseFloat(landSize), parseInt(isFarmer), parseInt(isStudent), parseInt(disability), id
    );
    res.json({ success: true, message: 'Citizen profile updated successfully!' });
  } catch (e) {
    res.json({ success: false, message: e.message });
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
      SET predicted_status = ?, admin_corrected = 1, xai_explanation = 'Predicted status manually corrected by administrator.'
      WHERE id = ?
    `).run(risk, id);
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

  res.render('admin-complaints', { session: req.session, complaints });
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
  const { id, status } = req.body;
  try {
    db.prepare('UPDATE complaints SET status = ? WHERE id = ?').run(status, id);
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
    db.prepare(`
      INSERT INTO tax_records (property_id, tax_amount, due_date, year, status)
      VALUES (?, ?, ?, ?, 'Unpaid')
    `).run(propertyId.toUpperCase(), parseFloat(taxAmount), dueDate, parseInt(year));
    res.json({ success: true, message: 'Tax record saved successfully!' });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

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
  res.render('admin-reminders', { session: req.session });
});

app.get('/api/admin/pending-reminders', requireAdmin, (req, res) => {
  try {
    const unpaid = db.prepare(`
      SELECT tr.*, p.owner_name
      FROM tax_records tr
      JOIN properties p ON tr.property_id = p.property_id
      WHERE tr.status = 'Unpaid'
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

app.post('/api/admin/send-reminder', requireAdmin, (req, res) => {
  const { propertyId, reminderType } = req.body;
  try {
    const user = db.prepare('SELECT * FROM users WHERE property_id = ?').get(propertyId);
    const phone = user ? user.phone : '9876543210';
    const name = user ? user.name : 'Citizen';
    
    const taxRecord = db.prepare("SELECT * FROM tax_records WHERE property_id = ? AND status = 'Unpaid' ORDER BY year DESC LIMIT 1").get(propertyId);
    if (!taxRecord) {
      return res.json({ success: false, message: 'No unpaid tax records found for this property.' });
    }
    
    const msg = `Dear ${name}, this is a reminder that your property tax of ₹${taxRecord.tax_amount} for Property ${propertyId} is ${reminderType === 'overdue' ? 'OVERDUE' : 'due in ' + reminderType + ' days'} (Due: ${taxRecord.due_date}). Please pay online. - Gram Panchayat`;
    
    db.prepare(`
      INSERT INTO sms_logs (property_id, phone, message, status)
      VALUES (?, ?, ?, 'Sent')
    `).run(propertyId, phone, msg);
    
    // Also log in reminders table
    db.prepare(`
      INSERT INTO reminders (property_id, tax_record_id, reminder_type, reminder_days, reminder_date, sent, sent_date, sms_sent)
      VALUES (?, ?, 'Tax Payment', ?, ?, 1, datetime('now'), 1)
    `).run(propertyId, taxRecord.id, reminderType, taxRecord.due_date);
    
    // Create citizen dashboard notification
    createNotification(
      propertyId, 'Citizen',
      'Tax Payment Reminder',
      msg,
      'Tax'
    );

    res.json({ success: true, message: `SMS reminder sent successfully to ${phone}!` });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

app.post('/api/admin/send-bulk-reminder', requireAdmin, (req, res) => {
  const { reminderType } = req.body;
  try {
    const unpaid = db.prepare(`
      SELECT tr.*, p.owner_name
      FROM tax_records tr
      JOIN properties p ON tr.property_id = p.property_id
      WHERE tr.status = 'Unpaid'
    `).all() || [];

    let sentCount = 0;
    unpaid.forEach(record => {
      const user = db.prepare('SELECT * FROM users WHERE property_id = ?').get(record.property_id);
      const phone = user ? user.phone : '9876543210';
      const name = user ? user.name : record.owner_name || 'Citizen';

      const msg = `Dear ${name}, this is a bulk reminder that your property tax of ₹${record.tax_amount} for Property ${record.property_id} is ${reminderType === 'overdue' ? 'OVERDUE' : 'due in ' + reminderType + ' days'} (Due: ${record.due_date}). Please pay online. - Gram Panchayat`;

      db.prepare(`
        INSERT INTO sms_logs (property_id, phone, message, status)
        VALUES (?, ?, ?, 'Sent')
      `).run(record.property_id, phone, msg);

      db.prepare(`
        INSERT INTO reminders (property_id, tax_record_id, reminder_type, reminder_days, reminder_date, sent, sent_date, sms_sent)
        VALUES (?, ?, 'Tax Payment', ?, ?, 1, datetime('now'), 1)
      `).run(record.property_id, record.id, reminderType, record.due_date);

      // Create notification
      createNotification(
        record.property_id, 'Citizen',
        'Tax Payment Reminder',
        msg,
        'Tax'
      );

      sentCount++;
    });

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
    const services = db.prepare('SELECT title, description FROM services WHERE status = "Active"').all() || [];
    const announcements = [
      { title: 'Gram Sabha Meeting', message: 'A meeting is scheduled for tomorrow at 10 AM regarding water supply.' },
      { title: 'Tax Payment Reminder', message: 'Please pay your property taxes before the due date to avoid fines.' }
    ];
    
    let taxInfo = null;
    if (propertyId) {
      taxInfo = db.prepare(`
        SELECT tr.*, p.owner_name, p.property_type
        FROM tax_records tr
        JOIN properties p ON tr.property_id = p.property_id
        WHERE tr.property_id = ? AND tr.status = 'Unpaid'
        ORDER BY tr.year DESC LIMIT 1
      `).get(propertyId);
    }
    
    const context = {
      services,
      announcements,
      tax_info: taxInfo,
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
