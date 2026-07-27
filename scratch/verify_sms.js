const Database = require('better-sqlite3');
const path = require('path');

function runTests() {
  console.log("=== SMS REMINDER CONSTRAINTS TEST ===");
  
  const dbPath = path.join(__dirname, '..', 'data', 'panchayat.db');
  console.log("Using Database Path:", dbPath);
  
  try {
    const db = new Database(dbPath);
    
    // 1. Clear SMS Logs table
    db.prepare("DELETE FROM sms_logs").run();
    console.log("🧹 SMS logs cleared.");

    // Helper to log SMS result
    const logSMSResult = (propertyId, phone, message, status, citizenName, taxStatus, errorMsg, taxAmount, dueDate, gatewayResponseId, provider) => {
      const stmt = db.prepare(`
        INSERT INTO sms_logs (property_id, phone, message, status, citizen_name, tax_status, error_message, tax_amount, due_date, gateway_response_id, provider)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      return stmt.run(propertyId, phone, message, status, citizenName, taxStatus, errorMsg, taxAmount, dueDate, gatewayResponseId, provider).lastInsertRowid;
    };

    // Helper to check for daily duplicate reminder
    const checkDuplicateToday = (propertyId) => {
      const row = db.prepare(`
        SELECT COUNT(*) as count FROM sms_logs 
        WHERE property_id = ? AND date(sent_at) = date('now') AND status = 'Sent'
      `).get(propertyId);
      return row.count > 0;
    };

    // 2. Verify duplicate check logic works
    console.log("\n[Test 1] Testing duplicate reminder detection on same day...");
    let isDup = checkDuplicateToday('PROP1001');
    console.log(`   Initial check (should be false): ${isDup}`);
    
    // Log a successful send
    logSMSResult('PROP1001', '9019876869', 'Dear Purusha Gowda...', 'Sent', 'Purusha Gowda', 'Unpaid', null, 9531.79, '2026-03-31', 'SM123456', 'Twilio');
    
    isDup = checkDuplicateToday('PROP1001');
    console.log(`   Post-send check (should be true): ${isDup}`);
    
    let pass = true;
    if (isDup === true) {
      console.log("   ✅ Succeeded: Duplicate checker successfully flagged duplicate reminder for same day.");
    } else {
      console.error("   ❌ Failed: Duplicate checker did not flag duplicate reminder.");
      pass = false;
    }

    // 3. Verify logging columns
    console.log("\n[Test 2] Verifying all new log columns are recorded correctly...");
    const log = db.prepare("SELECT * FROM sms_logs WHERE property_id = 'PROP1001'").get();

    if (log.tax_amount === 9531.79 && log.due_date === '2026-03-31' && log.gateway_response_id === 'SM123456' && log.status === 'Sent' && log.provider === 'Twilio') {
      console.log("   ✅ Succeeded: Tax amount, due date, gateway response ID, provider, and status are successfully logged.");
    } else {
      console.error("   ❌ Failed: Missing or incorrect log data:", log);
      pass = false;
    }

    // 4. Verify failed transaction logging with actual error
    console.log("\n[Test 3] Verifying failed transaction logging on gateway error...");
    logSMSResult('PROP1002', '7483933563', 'Dear Varija...', 'Failed', 'Varija kom Chinnaiah Gowda', 'Overdue', 'Auth failure', 1449.76, '2026-03-31', null, 'Fast2SMS');
    
    const failedLog = db.prepare("SELECT * FROM sms_logs WHERE property_id = 'PROP1002'").get();

    if (failedLog.status === 'Failed' && failedLog.error_message === 'Auth failure' && failedLog.provider === 'Fast2SMS') {
      console.log("   ✅ Succeeded: Gateway failures are logged with status 'Failed', include the actual error message, and record provider.");
    } else {
      console.error("   ❌ Failed: Incorrect failure logging format:", failedLog);
      pass = false;
    }

    if (pass) {
      console.log("\n🎉 ALL SMS GATEWAY CONSTRAINTS TESTS PASSED!");
    } else {
      console.error("\n❌ SOME SMS GATEWAY CONSTRAINTS TESTS FAILED.");
    }

    db.close();
    process.exit(pass ? 0 : 1);
  } catch (e) {
    console.error("❌ Error running tests:", e.message);
    process.exit(1);
  }
}

runTests();
