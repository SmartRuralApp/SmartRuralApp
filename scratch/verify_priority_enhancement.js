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
    
    // Exact path to predict script in user workspace
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
    // 1. Emergency cases
    {
      description: "A huge tree fallen on the road blocking traffic",
      category: "Road Damage",
      ward: "Ward 1",
      similarCount: 0,
      expected: "High",
      label: "Emergency: Tree fallen"
    },
    {
      description: "An electric pole fallen near the school, sparking wire danger",
      category: "Electricity",
      ward: "Ward 2",
      similarCount: 0,
      expected: "High",
      label: "Emergency: Electric pole fallen"
    },
    {
      description: "There is a live wire hanging low over the pathway",
      category: "Electricity",
      ward: "Ward 3",
      similarCount: 0,
      expected: "High",
      label: "Emergency: Live wire"
    },
    {
      description: "Fire broke out near the local trash yard",
      category: "Sanitation",
      ward: "Ward 4",
      similarCount: 0,
      expected: "High",
      label: "Emergency: Fire"
    },
    
    // 2. Normal / non-emergency cases
    {
      description: "The street light in our street has been flickering since last week.",
      category: "Street Light",
      ward: "Ward 1",
      similarCount: 0,
      expected: "Low",
      label: "First normal complaint"
    },
    {
      description: "The street light in our street has been flickering since last week.",
      category: "Street Light",
      ward: "Ward 1",
      similarCount: 1, // 2 complaints total
      expected: "Medium",
      label: "Two similar complaints in same ward"
    },
    {
      description: "The street light in our street has been flickering since last week.",
      category: "Street Light",
      ward: "Ward 1",
      similarCount: 2, // 3 complaints total
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
