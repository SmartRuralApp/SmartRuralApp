const { exec } = require('child_process');

function runMLInference(task, data) {
  return new Promise((resolve, reject) => {
    const escapedJson = JSON.stringify(data).replace(/"/g, '\\"');
    const cmd = `python ml/predict.py ${task} "${escapedJson}"`;
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        return reject(stderr || error.message);
      }
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (e) {
        reject(stdout);
      }
    });
  });
}

async function run() {
  console.log("=== Verifying Runtime ML Predictions ===");

  try {
    const taxRes = await runMLInference('--predict-defaulter', {
      property_type: 'Commercial',
      tax_amount: 8000.0,
      year: 2026,
      history_paid_ratio: 0.2,
      late_payments: 3
    });
    console.log("\n1. Tax Defaulter Prediction Output:");
    console.log(JSON.stringify(taxRes, null, 2));
  } catch (e) {
    console.error("1. Tax Defaulter Error:", e);
  }

  try {
    const schemeRes = await runMLInference('--recommend-schemes', {
      age: 22,
      gender: 'Female',
      occupation: 'Student',
      income: 50000.0,
      land_size: 0.0,
      is_farmer: 0,
      is_student: 1,
      disability: 0
    });
    console.log("\n2. Scheme Recommendation Output:");
    console.log(JSON.stringify(schemeRes, null, 2));
  } catch (e) {
    console.error("2. Scheme Recommendation Error:", e);
  }

  try {
    const prioRes = await runMLInference('--predict-priority', {
      description: 'Main pipe burst flooding streets near temple',
      category: 'Water Supply',
      ward: 'Ward 2',
      similar_count: 4,
      is_duplicate: 0
    });
    console.log("\n3. Complaint Priority Prediction Output:");
    console.log(JSON.stringify(prioRes, null, 2));
  } catch (e) {
    console.error("3. Complaint Priority Error:", e);
  }

  try {
    const dupRes = await runMLInference('--detect-duplicate', {
      description: 'Huge street leak flooding block b',
      category: 'Water Supply',
      existing: [
        { id: '1', description: 'Low water pressure in municipal tap' },
        { id: '2', description: 'Main pipeline burst flooding municipal road' }
      ]
    });
    console.log("\n4. Duplicate Complaint Detection Output:");
    console.log(JSON.stringify(dupRes, null, 2));
  } catch (e) {
    console.error("4. Duplicate Error:", e);
  }
}

run();
