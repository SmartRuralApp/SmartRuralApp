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
      description: "Tree fallen near school",
      category: "Road Damage",
      ward: "Ward 1",
      similarCount: 0,
      expected: "High",
      label: "Emergency: Tree fallen near school"
    },
    {
      description: "Live electric wire",
      category: "Electricity",
      ward: "Ward 2",
      similarCount: 0,
      expected: "High",
      label: "Emergency: Live electric wire"
    },
    {
      description: "Transformer blast",
      category: "Electricity",
      ward: "Ward 3",
      similarCount: 0,
      expected: "High",
      label: "Emergency: Transformer blast"
    },
    {
      description: "Gas leak",
      category: "Others",
      ward: "Ward 1",
      similarCount: 0,
      expected: "High",
      label: "Emergency: Gas leak"
    },
    {
      description: "Fire in market",
      category: "Sanitation",
      ward: "Ward 2",
      similarCount: 0,
      expected: "High",
      label: "Emergency: Fire in market"
    },
    {
      description: "Building collapse",
      category: "Road Damage",
      ward: "Ward 3",
      similarCount: 0,
      expected: "High",
      label: "Emergency: Building collapse"
    },
    {
      description: "Flood in village",
      category: "Water Supply",
      ward: "Ward 1",
      similarCount: 0,
      expected: "High",
      label: "Emergency: Flood in village"
    },
    {
      description: "Road blocked due to landslide",
      category: "Road Damage",
      ward: "Ward 2",
      similarCount: 0,
      expected: "High",
      label: "Emergency: Road blocked due to landslide"
    },
    
    // 2. Normal / non-emergency cases (relying on similar complaint count mapping)
    {
      description: "Garbage collection delayed",
      category: "Sanitation",
      ward: "Ward 1",
      similarCount: 0, // 0/1 similar -> Low
      expected: "Low",
      label: "Normal: Garbage collection delayed (similar=0)"
    },
    {
      description: "Garbage collection delayed",
      category: "Sanitation",
      ward: "Ward 1",
      similarCount: 2, // 2 similar -> Medium
      expected: "Medium",
      label: "Normal: Garbage collection delayed (similar=2)"
    },
    {
      description: "Street light not working",
      category: "Street Light",
      ward: "Ward 2",
      similarCount: 0, // 0/1 similar -> Low
      expected: "Low",
      label: "Normal: Street light not working (similar=0)"
    },
    {
      description: "Street light not working",
      category: "Street Light",
      ward: "Ward 2",
      similarCount: 3, // >=3 similar -> High
      expected: "High",
      label: "Normal: Street light not working (similar=3)"
    },
    {
      description: "Water supply issue",
      category: "Water Supply",
      ward: "Ward 3",
      similarCount: 0, // 0/1 similar -> Low
      expected: "Low",
      label: "Normal: Water supply issue (similar=0)"
    },
    {
      description: "Water supply issue",
      category: "Water Supply",
      ward: "Ward 3",
      similarCount: 2, // 2 similar -> Medium
      expected: "Medium",
      label: "Normal: Water supply issue (similar=2)"
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
