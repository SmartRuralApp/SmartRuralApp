const { exec } = require('child_process');
const path = require('path');

function predictPriority(description, category, ward, similarCount = 0, historicalFrequency = 0) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      description,
      category,
      ward,
      similar_count: similarCount,
      historical_frequency: historicalFrequency
    });
    
    const predictPath = 'C:\\MAJOR PROJECT\\ml\\predict.py';
    const cmd = `python "${predictPath}" --predict-priority "${payload.replace(/"/g, '\\"')}"`;
    
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error("Predict Error:", stderr || error.message);
        return reject(error);
      }
      try {
        const res = JSON.parse(stdout.trim());
        resolve(res);
      } catch (e) {
        reject(new Error(`Failed to parse prediction output: ${stdout}`));
      }
    });
  });
}

async function main() {
  console.log("=== COMPLAINT PRIORITY PREDICTION ENHANCEMENT VERIFICATION ===");

  let pass = true;

  const testCases = [
    // 1. Emergency cases (override prediction to High)
    {
      description: "tree fallen in our area",
      category: "Road Damage",
      ward: "Ward 1",
      similarCount: 0,
      expected: "High",
      label: "Emergency: tree fallen"
    },
    {
      description: "electric wire fell on road",
      category: "Electricity",
      ward: "Ward 2",
      similarCount: 0,
      expected: "High",
      label: "Emergency: electric wire"
    },
    {
      description: "fire near school",
      category: "Sanitation",
      ward: "Ward 3",
      similarCount: 0,
      expected: "High",
      label: "Emergency: fire"
    },
    
    // 2. Normal / non-emergency cases (relying on similar complaint count mapping)
    {
      description: "The street light in our street has been flickering since last week.",
      category: "Street Light",
      ward: "Ward 1",
      similarCount: 0, // First complaint -> Low
      expected: "Low",
      label: "First normal complaint (similar count = 0)"
    },
    {
      description: "The street light in our street has been flickering since last week.",
      category: "Street Light",
      ward: "Ward 1",
      similarCount: 1, // 1 similar complaint -> Low
      expected: "Low",
      label: "One similar complaint in same ward"
    },
    {
      description: "The street light in our street has been flickering since last week.",
      category: "Street Light",
      ward: "Ward 1",
      similarCount: 2, // 2 similar complaints -> Medium
      expected: "Medium",
      label: "Two similar complaints in same ward"
    },
    {
      description: "The street light in our street has been flickering since last week.",
      category: "Street Light",
      ward: "Ward 1",
      similarCount: 3, // More than 2 similar complaints -> High
      expected: "High",
      label: "More than two similar complaints in same ward"
    }
  ];

  for (const tc of testCases) {
    console.log(`\nTesting: [${tc.label}]`);
    console.log(`> Text: "${tc.description}"`);
    console.log(`> Similar Count: ${tc.similarCount}`);
    
    try {
      const res = await predictPriority(tc.description, tc.category, tc.ward, tc.similarCount);
      console.log(`> Result Priority: ${res.priority}`);
      console.log(`> Confidence: ${res.confidence}`);
      console.log(`> Reason: ${res.reasons.join(' | ')}`);
      
      if (res.priority === tc.expected) {
        console.log(`✅ Passed!`);
      } else {
        console.error(`❌ Failed! Expected ${tc.expected} but got ${res.priority}`);
        pass = false;
      }
    } catch (e) {
      console.error(`❌ Error during execution:`, e.message);
      pass = false;
    }
  }

  console.log("\n==================================================");
  if (pass) {
    console.log("🎉 ALL PRIORITY PREDICTION ENHANCEMENT TESTS PASSED!");
    process.exit(0);
  } else {
    console.error("❌ SOME TESTS FAILED. PLEASE DEBUG.");
    process.exit(1);
  }
}

main();
