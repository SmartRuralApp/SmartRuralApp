const Database = require('better-sqlite3');
const path = require('path');

function runTests() {
  console.log("=== CITIZEN NOTIFICATIONS ISOLATION TEST ===");
  
  const dbPath = path.join(__dirname, '..', 'data', 'panchayat.db');
  console.log("Using Database Path:", dbPath);
  
  try {
    const db = new Database(dbPath);
    
    // Clear existing notifications first
    db.prepare("DELETE FROM notifications").run();
    console.log("🧹 Notifications table cleared.");
    
    // Helper to create notification
    const createNotification = (userId, role, title, message, type) => {
      const stmt = db.prepare(`
        INSERT INTO notifications (user_id, role, title, message, type)
        VALUES (?, ?, ?, ?, ?)
      `);
      const result = stmt.run(userId, role, title, message, type);
      return result.lastInsertRowid;
    };
    
    // Helper to query notifications
    const getCitizenNotifications = (propertyId) => {
      return db.prepare(`
        SELECT * FROM notifications 
        WHERE user_id = ?
        ORDER BY created_at DESC
      `).all(propertyId) || [];
    };
    
    // 1. Seed targeted notifications
    console.log("\n[Test 1] Seeding targeted citizen notifications...");
    createNotification('PROP1001', 'Citizen', 'Tax Reminder', 'PROP1001 tax is pending.', 'Tax');
    createNotification('PROP1002', 'Citizen', 'Scheme Eligibility', 'PROP1002 is eligible for PM Kisan.', 'Scheme');
    createNotification('PROP1003', 'Citizen', 'Complaint Resolved', 'PROP1003 complaint resolved.', 'Complaint');
    
    // 2. Verify notifications are strictly isolated
    console.log("\n[Test 2] Verifying notifications are strictly isolated per citizen...");
    
    const notifs1 = getCitizenNotifications('PROP1001');
    const notifs2 = getCitizenNotifications('PROP1002');
    const notifs3 = getCitizenNotifications('PROP1003');
    
    let pass = true;
    
    if (notifs1.length === 1 && notifs1[0].user_id === 'PROP1001' && notifs1[0].title === 'Tax Reminder') {
      console.log("   ✅ PROP1001 only sees their own tax reminder.");
    } else {
      console.error("   ❌ PROP1001 notifications check failed:", notifs1);
      pass = false;
    }
    
    if (notifs2.length === 1 && notifs2[0].user_id === 'PROP1002' && notifs2[0].title === 'Scheme Eligibility') {
      console.log("   ✅ PROP1002 only sees their own scheme eligibility.");
    } else {
      console.error("   ❌ PROP1002 notifications check failed:", notifs2);
      pass = false;
    }
    
    if (notifs3.length === 1 && notifs3[0].user_id === 'PROP1003' && notifs3[0].title === 'Complaint Resolved') {
      console.log("   ✅ PROP1003 only sees their own complaint resolution.");
    } else {
      console.error("   ❌ PROP1003 notifications check failed:", notifs3);
      pass = false;
    }
    
    // Check cross-leakage
    const allProp1 = notifs1.map(n => n.user_id);
    const allProp2 = notifs2.map(n => n.user_id);
    const allProp3 = notifs3.map(n => n.user_id);
    
    if (allProp1.includes('PROP1002') || allProp1.includes('PROP1003') || 
        allProp2.includes('PROP1001') || allProp2.includes('PROP1003') ||
        allProp3.includes('PROP1001') || allProp3.includes('PROP1002')) {
      console.error("   ❌ Critical failure: Data leakage detected between properties!");
      pass = false;
    } else {
      console.log("   ✅ Succeeded: Zero cross-citizen data leakage confirmed.");
    }
    
    if (pass) {
      console.log("\n🎉 ALL NOTIFICATION ISOLATION TESTS PASSED!");
    } else {
      console.error("\n❌ SOME NOTIFICATION ISOLATION TESTS FAILED.");
    }
    
    db.close();
    process.exit(pass ? 0 : 1);
  } catch (e) {
    console.error("❌ Error running tests:", e.message);
    process.exit(1);
  }
}

runTests();
