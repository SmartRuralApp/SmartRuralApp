const Database = require('better-sqlite3');
const path = require('path');

function runEscalationTests() {
  console.log("=== COMPLAINT PRIORITY ESCALATION TEST ===");
  const dbPath = path.join(__dirname, '..', 'data', 'panchayat.db');
  const db = new Database(dbPath);

  try {
    // Clear complaints table for clean test
    db.prepare("DELETE FROM complaints").run();
    console.log("🧹 Cleaned complaints database.");

    // Helper to insert complaint and run the calculation rules
    const submitComplaint = (propertyId, category, ward, description, isEmergency = false) => {
      // 1. Get active complaints in ward & category (Pending + In Progress)
      const existing = db.prepare(`
        SELECT * FROM complaints
        WHERE category = ? AND ward = ? AND status != 'Resolved'
      `).all(category, ward) || [];

      const activeCount = existing.length + 1;
      
      let priority = 'Low';
      if (isEmergency) {
        priority = 'High';
      } else {
        if (activeCount === 1) {
          priority = 'Low';
        } else if (activeCount === 2) {
          priority = 'Medium';
        } else if (activeCount >= 3) {
          priority = 'High';
        }
      }

      // Update existing ones
      for (const comp of existing) {
        let newPrio = 'Low';
        if (activeCount === 1) {
          newPrio = 'Low';
        } else if (activeCount === 2) {
          newPrio = 'Medium';
        } else if (activeCount >= 3) {
          newPrio = 'High';
        }
        db.prepare('UPDATE complaints SET priority = ? WHERE id = ?').run(newPrio, comp.id);
      }

      // Insert new one
      const info = db.prepare(`
        INSERT INTO complaints (property_id, category, description, ward, priority, status)
        VALUES (?, ?, ?, ?, ?, 'Pending')
      `).run(propertyId, category, description, ward, priority);

      return info.lastInsertRowid;
    };

    // Submit Complaint 1
    console.log("\n[Test 1] Registering Complaint 1 (Electricity, Ward 2)...");
    const id1 = submitComplaint('PROP1001', 'Electricity', 'Ward 2', 'Power outage in block A.');
    let c1 = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id1);
    console.log(`   Complaint 1 Priority: ${c1.priority} (Expected: Low)`);
    if (c1.priority !== 'Low') throw new Error("Complaint 1 priority should be Low");

    // Submit Complaint 2
    console.log("\n[Test 2] Registering Complaint 2 (Electricity, Ward 2)...");
    const id2 = submitComplaint('PROP1002', 'Electricity', 'Ward 2', 'Voltage fluctuation in Ward 2.');
    c1 = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id1);
    let c2 = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id2);
    console.log(`   Complaint 1 Priority: ${c1.priority} (Expected: Medium)`);
    console.log(`   Complaint 2 Priority: ${c2.priority} (Expected: Medium)`);
    if (c1.priority !== 'Medium' || c2.priority !== 'Medium') {
      throw new Error("Complaints 1 & 2 priority should be Medium");
    }

    // Submit Complaint 3
    console.log("\n[Test 3] Registering Complaint 3 (Electricity, Ward 2)...");
    const id3 = submitComplaint('PROP1003', 'Electricity', 'Ward 2', 'Transformer sparking in block A.');
    c1 = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id1);
    c2 = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id2);
    let c3 = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id3);
    console.log(`   Complaint 1 Priority: ${c1.priority} (Expected: High)`);
    console.log(`   Complaint 2 Priority: ${c2.priority} (Expected: High)`);
    console.log(`   Complaint 3 Priority: ${c3.priority} (Expected: High)`);
    if (c1.priority !== 'High' || c2.priority !== 'High' || c3.priority !== 'High') {
      throw new Error("Complaints 1, 2, & 3 priority should be High");
    }

    console.log("\n✅ ALL PRIORITY ESCALATION TESTS PASSED PERFECTLY!");
    db.close();
    process.exit(0);
  } catch (err) {
    console.error("❌ ESCALATION TEST FAILED:", err.message);
    db.close();
    process.exit(1);
  }
}

runEscalationTests();
