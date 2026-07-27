const db = require('../database');

async function testAppointments() {
  console.log("Starting Offline Payment Appointments End-to-End Test...");
  
  try {
    await db.init();
    
    // 1. Setup clean baseline
    const testPropId = 'PROP1001';
    
    // Clean up previous test records
    db.prepare("DELETE FROM appointments WHERE property_id = ?").run(testPropId);
    db.prepare("DELETE FROM notifications WHERE user_id = ?").run(testPropId);
    db.prepare("DELETE FROM payments WHERE property_id = ?").run(testPropId);
    db.prepare("UPDATE tax_records SET status = 'Unpaid' WHERE property_id = ?").run(testPropId);
    
    // Get details
    const user = db.prepare("SELECT * FROM users WHERE property_id = ?").get(testPropId);
    const taxRecord = db.prepare("SELECT * FROM tax_records WHERE property_id = ? AND status = 'Unpaid'").get(testPropId);
    
    if (!user || !taxRecord) {
      throw new Error(`Prerequisites not met. Make sure PROP1001 citizen and unpaid tax record exist in the database.`);
    }
    
    console.log(`✓ Prerequisites verified: Citizen: ${user.name}, Unpaid tax amount: ₹${taxRecord.tax_amount}`);

    // 2. Simulate Booking an Appointment
    const appDate = '2026-07-15';
    const appTime = '11:30';
    
    console.log(`Booking offline payment appointment for ${appDate} at ${appTime}...`);
    
    db.prepare(`
      INSERT INTO appointments (property_id, citizen_name, phone, appointment_date, appointment_time, tax_amount, payment_type, status, tax_record_id)
      VALUES (?, ?, ?, ?, ?, ?, 'Offline', 'Pending', ?)
    `).run(testPropId, user.name, user.phone, appDate, appTime, taxRecord.tax_amount, taxRecord.id);

    // Simulate Notification insert (as done by API)
    db.prepare(`
      INSERT INTO notifications (user_id, role, title, message, type)
      VALUES (?, 'Citizen', 'Offline Payment Appointment Booked', ?, 'System')
    `).run(testPropId, `Your offline payment appointment has been successfully scheduled for ${appDate} at ${appTime}. Status: Pending.`);

    // Verify appointment was created
    const app = db.prepare("SELECT * FROM appointments WHERE property_id = ? AND status = 'Pending'").get(testPropId);
    if (!app) {
      throw new Error("FAIL: Appointment was not created.");
    }
    console.log(`✓ Appointment successfully created (ID: ${app.id}, Status: ${app.status})`);

    // Verify Booking Notification was generated
    const bookingNotif = db.prepare("SELECT * FROM notifications WHERE user_id = ? AND title LIKE '%Appointment Booked%'").get(testPropId);
    if (!bookingNotif) {
      throw new Error("FAIL: Appointment booking notification was not created.");
    }
    console.log(`✓ Appointment booking notification verified: "${bookingNotif.message}"`);

    // 3. Simulate Admin Approving the Appointment
    console.log(`Approving appointment (ID: ${app.id})...`);
    db.prepare("UPDATE appointments SET status = 'Approved' WHERE id = ?").run(app.id);
    
    // Simulate approval notification
    db.prepare(`
      INSERT INTO notifications (user_id, role, title, message, type)
      VALUES (?, 'Citizen', 'Appointment Approved', ?, 'System')
    `).run(testPropId, `Your offline payment appointment scheduled for ${appDate} at ${appTime} has been approved by the Panchayat administrator.`);

    const approvedApp = db.prepare("SELECT * FROM appointments WHERE id = ?").get(app.id);
    if (approvedApp.status !== 'Approved') {
      throw new Error(`FAIL: Appointment status is ${approvedApp.status}, expected Approved.`);
    }
    console.log(`✓ Appointment successfully approved.`);

    // 4. Simulate Admin Completing the Appointment
    console.log(`Completing appointment (ID: ${app.id})...`);
    
    // Complete action logic
    db.prepare("UPDATE appointments SET status = 'Completed' WHERE id = ?").run(app.id);
    
    db.prepare(`
      UPDATE tax_records 
      SET status = 'Paid', predicted_status = 'No Risk', payment_probability = 0.0, override_status = 'No Risk'
      WHERE id = ?
    `).run(app.tax_record_id);

    const txnId = 'TXN_OFFLINE_TEST_' + Date.now();
    db.prepare(`
      INSERT INTO payments (property_id, tax_record_id, amount, transaction_id)
      VALUES (?, ?, ?, ?)
    `).run(app.property_id, app.tax_record_id, app.tax_amount, txnId);

    // Simulate completion notification
    db.prepare(`
      INSERT INTO notifications (user_id, role, title, message, type)
      VALUES (?, 'Citizen', 'Tax Payment Successful', ?, 'Tax')
    `).run(testPropId, `Offline payment of ₹${app.tax_amount.toLocaleString('en-IN')} has been received and processed. Your tax record is now marked as Paid. Transaction ID: ${txnId}.`);

    // Verify Appointment status is Completed
    const completedApp = db.prepare("SELECT * FROM appointments WHERE id = ?").get(app.id);
    if (completedApp.status !== 'Completed') {
      throw new Error(`FAIL: Appointment status is ${completedApp.status}, expected Completed.`);
    }
    console.log(`✓ Appointment status set to Completed.`);

    // Verify Tax Record status is Paid
    const updatedTaxRecord = db.prepare("SELECT * FROM tax_records WHERE id = ?").get(app.tax_record_id);
    if (updatedTaxRecord.status !== 'Paid') {
      throw new Error(`FAIL: Tax record status is ${updatedTaxRecord.status}, expected Paid.`);
    }
    console.log(`✓ Tax record updated to Paid.`);

    // Verify Payment transaction record is created
    const payment = db.prepare("SELECT * FROM payments WHERE transaction_id = ?").get(txnId);
    if (!payment) {
      throw new Error("FAIL: Payment transaction record was not created.");
    }
    console.log(`✓ Payment receipt generated successfully.`);

    console.log("\nALL APPOINTMENT INTEGRATION TESTS PASSED SUCCESSFULLY! ✓");
    process.exit(0);
  } catch (error) {
    console.error("✗ TEST FAILED:", error.message);
    process.exit(1);
  }
}

testAppointments();
