const { exec } = require('child_process');
const path = require('path');

function runChatbot(query, context, history) {
  return new Promise((resolve, reject) => {
    const queryB64 = Buffer.from(query).toString('base64');
    const contextB64 = Buffer.from(JSON.stringify(context)).toString('base64');
    const historyB64 = Buffer.from(JSON.stringify(history)).toString('base64');
    
    // Path to chatbot script
    const chatbotPath = path.join(__dirname, '..', 'ml', 'chatbot.py');
    const cmd = `python "${chatbotPath}" --query_b64 "${queryB64}" --context_b64 "${contextB64}" --history_b64 "${historyB64}"`;
    
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error("Chatbot Error:", stderr || error.message);
        return reject(error);
      }
      resolve(stdout.trim());
    });
  });
}

async function main() {
  console.log("=== VERIFYING DYNAMIC GRAMMITRA AI CHATBOT (OFFLINE-FIRST) ===");

  const sampleContext = {
    services: [
      { title: "Birth Certificate", description: "Apply online for birth certificates." },
      { title: "Water Connection", description: "Get a water supply connection for your property." }
    ],
    schemes: [
      { title: "PM Kisan", target_criteria: "Small & Marginal Farmers", required_documents: "Aadhaar, Land Records", benefits: "₹6,000 per year" },
      { title: "MGNREGA", target_criteria: "Rural Households", required_documents: "Job Card, Aadhaar", benefits: "100 days of guaranteed wage employment" }
    ],
    announcements: [
      { title: "Gram Sabha Meeting", message: "A meeting is scheduled for tomorrow at 10 AM." }
    ],
    tax_info: {
      property_id: "PROP1001",
      owner_name: "Purusha Gowda",
      tax_amount: 9531.79,
      status: "Unpaid",
      due_date: "2026-03-31",
      predicted_status: "Medium Risk"
    },
    complaints: [
      { id: 1, category: "Sanitation", description: "Drainage overflow near Main Road.", status: "In Progress", priority: "High" }
    ]
  };

  let pass = true;

  // 1. Timings Query
  console.log("\n[Test 1] Query: 'When is the Gram Panchayat office open?'");
  try {
    const reply = await runChatbot("When is the Gram Panchayat office open?", sampleContext, []);
    console.log("Response:\n", reply);
    if (reply.includes("Monday to Friday") && reply.includes("9:00 AM to 5:00 PM")) {
      console.log("   ✅ Succeeded: Office hours answered correctly.");
    } else {
      console.error("   ❌ Failed: Office hours answer incorrect.");
      pass = false;
    }
  } catch (e) {
    console.error("   ❌ Error:", e.message);
    pass = false;
  }

  // 2. Personal Property Tax Query
  console.log("\n[Test 2] Query: 'How much tax do I owe?'");
  try {
    const reply = await runChatbot("How much tax do I owe?", sampleContext, []);
    console.log("Response:\n", reply);
    if (reply.includes("PROP1001") && reply.includes("9531.79") && reply.includes("Purusha Gowda")) {
      console.log("   ✅ Succeeded: Citizen-specific outstanding tax details merged successfully.");
    } else {
      console.error("   ❌ Failed: Did not retrieve correct property/owner tax data.");
      pass = false;
    }
  } catch (e) {
    console.error("   ❌ Error:", e.message);
    pass = false;
  }

  // 3. Conversational Follow-Up Query
  console.log("\n[Test 3] Follow-up Query: 'how to pay it?' (after asking about tax)");
  try {
    const history = [
      { role: "user", content: "How much tax do I owe?" },
      { role: "assistant", content: "Your outstanding tax is ₹9531.79 for Property ID PROP1001." }
    ];
    const reply = await runChatbot("how to pay it?", sampleContext, history);
    console.log("Response:\n", reply);
    if (reply.includes("online") || reply.includes("Tax Search") || reply.includes("Panchayat office")) {
      console.log("   ✅ Succeeded: Follow-up resolved correctly (tax payment guide provided).");
    } else {
      console.error("   ❌ Failed: Did not resolve follow-up query context.");
      pass = false;
    }
  } catch (e) {
    console.error("   ❌ Error:", e.message);
    pass = false;
  }

  // 4. Scheme Details Query
  console.log("\n[Test 4] Query: 'Tell me details about PM Kisan'");
  try {
    const reply = await runChatbot("Tell me details about PM Kisan", sampleContext, []);
    console.log("Response:\n", reply);
    if (reply.includes("PM Kisan") && reply.includes("Farmers") && reply.includes("Aadhaar, Land Records")) {
      console.log("   ✅ Succeeded: Scheme details extracted from database context correctly.");
    } else {
      console.error("   ❌ Failed: Scheme details lookup failed.");
      pass = false;
    }
  } catch (e) {
    console.error("   ❌ Error:", e.message);
    pass = false;
  }

  // 5. Out of Scope Query Refusal
  console.log("\n[Test 5] Query: 'write a python code to scrape twitter'");
  try {
    const reply = await runChatbot("write a python code to scrape twitter", sampleContext, []);
    console.log("Response:\n", reply);
    if (reply.includes("Smart Gram Panchayat Assistant") && reply.includes("citizen-related queries")) {
      console.log("   ✅ Succeeded: Out-of-scope query politely declined/guided.");
    } else {
      console.error("   ❌ Failed: Chatbot did not politely decline out-of-scope query.");
      pass = false;
    }
  } catch (e) {
    console.error("   ❌ Error:", e.message);
    pass = false;
  }

  // Negative constraint check (no 'I don't know' etc.)
  const forbiddenPhrases = ["i don't know", "i cannot answer", "information is unavailable"];
  const allTestsText = [
    await runChatbot("Taxes due", sampleContext, []),
    await runChatbot("what schemes do you have?", sampleContext, []),
    await runChatbot("Water connection details", sampleContext, []),
    await runChatbot("complaint tracker", sampleContext, [])
  ].join("\n").toLowerCase();
  
  if (forbiddenPhrases.some(phrase => allTestsText.includes(phrase))) {
    console.error("   ❌ Failed: Chatbot used forbidden fallback phrases!");
    pass = false;
  } else {
    console.log("   ✅ Succeeded: Chatbot adhered to negative constraints (no 'I don't know' reply).");
  }

  if (pass) {
    console.log("\n🎉 ALL CHATBOT VERIFICATION TESTS PASSED!");
    process.exit(0);
  } else {
    console.error("\n❌ SOME CHATBOT VERIFICATION TESTS FAILED.");
    process.exit(1);
  }
}

main();
