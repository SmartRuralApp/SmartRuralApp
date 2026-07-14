const { exec } = require('child_process');

function runML(task, data) {
  return new Promise((resolve, reject) => {
    // Escape quotes for command line
    const escapedJson = JSON.stringify(data).replace(/"/g, '\\"');
    const cmd = `python ml/predict.py ${task} "${escapedJson}"`;
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error("ML Error:", stderr || error.message);
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

async function main() {
  console.log("=== VERIFYING ML MODELS INFERENCE ===");
  
  // 1. Suggest Category
  try {
    const cat = await runML('--predict-category', {
      description: "Our street lighting has been broken for three days, making the road completely dark at night."
    });
    console.log("\n[OK] Category Suggestion Result:");
    console.log(JSON.stringify(cat, null, 2));
  } catch(e) {
    console.error("[FAIL] Category Suggestion Error:", e.message);
  }

  // 2. Predict Priority
  try {
    const prio = await runML('--predict-priority', {
      description: "Water pipe has burst and is flooding the entire school campus road.",
      category: "Water Supply",
      ward: "Ward 3"
    });
    console.log("\n[OK] Priority Prediction Result:");
    console.log(JSON.stringify(prio, null, 2));
  } catch(e) {
    console.error("[FAIL] Priority Prediction Error:", e.message);
  }

  // 3. Recommend Schemes
  try {
    const schemes = await runML('--recommend-schemes', {
      age: 45,
      gender: "Male",
      occupation: "Agriculture",
      income: 75000.0,
      land_size: 2.5,
      is_farmer: 1,
      is_student: 0,
      disability: 0
    });
    console.log("\n[OK] Schemes Recommendation Result:");
    console.log(JSON.stringify(schemes, null, 2));
  } catch(e) {
    console.error("[FAIL] Schemes Recommendation Error:", e.message);
  }

  // 4. Tax Defaulter Risk - Status: Paid
  try {
    const taxPaid = await runML('--predict-defaulter', {
      property_type: "Residential",
      tax_amount: 1800.0,
      year: 2026,
      history_paid_ratio: 1.0,
      late_payments: 0,
      status: "Paid"
    });
    console.log("\n[OK] Tax Defaulter Prediction (Status: Paid) Result:");
    console.log(JSON.stringify(taxPaid, null, 2));
    if (taxPaid.risk !== 'Low Risk') {
      throw new Error(`Expected Low Risk, got ${taxPaid.risk}`);
    }
  } catch(e) {
    console.error("[FAIL] Tax Defaulter (Paid) Error:", e.message);
  }

  // 5. Tax Defaulter Risk - Status: Unpaid
  try {
    const taxUnpaid = await runML('--predict-defaulter', {
      property_type: "Residential",
      tax_amount: 1800.0,
      year: 2026,
      history_paid_ratio: 0.5,
      late_payments: 1,
      status: "Unpaid"
    });
    console.log("\n[OK] Tax Defaulter Prediction (Status: Unpaid) Result:");
    console.log(JSON.stringify(taxUnpaid, null, 2));
    if (taxUnpaid.risk !== 'Medium Risk') {
      throw new Error(`Expected Medium Risk, got ${taxUnpaid.risk}`);
    }
  } catch(e) {
    console.error("[FAIL] Tax Defaulter (Unpaid) Error:", e.message);
  }

  // 6. Tax Defaulter Risk - Status: Overdue
  try {
    const taxOverdue = await runML('--predict-defaulter', {
      property_type: "Commercial",
      tax_amount: 5500.0,
      year: 2025,
      history_paid_ratio: 0.2,
      late_payments: 3,
      status: "Overdue"
    });
    console.log("\n[OK] Tax Defaulter Prediction (Status: Overdue) Result:");
    console.log(JSON.stringify(taxOverdue, null, 2));
    if (taxOverdue.risk !== 'High Risk') {
      throw new Error(`Expected High Risk, got ${taxOverdue.risk}`);
    }
  } catch(e) {
    console.error("[FAIL] Tax Defaulter (Overdue) Error:", e.message);
  }

  // 7. Duplicate Detection
  try {
    const dup = await runML('--detect-duplicate', {
      description: "Water leakage on street light road near the temple arch",
      category: "Water Supply",
      existing: [
        { id: 10, description: "Huge water leakage near the temple arch in block b" },
        { id: 11, description: "Road surface is cracked and needs new asphalt laying" }
      ]
    });
    console.log("\n[OK] Duplicate Detection Result:");
    console.log(JSON.stringify(dup, null, 2));
  } catch(e) {
    console.error("[FAIL] Duplicate Detection Error:", e.message);
  }
}

main();
