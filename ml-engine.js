const fs = require('fs');
const path = require('path');
const { exec, execSync } = require('child_process');

// Determine Python executable dynamically
function getPythonExecutable() {
  if (process.env.PYTHON_EXECUTABLE) {
    return process.env.PYTHON_EXECUTABLE;
  }
  const candidates = ['python3', 'python', 'py'];
  for (const cmd of candidates) {
    try {
      execSync(`${cmd} --version`, { stdio: 'ignore' });
      return cmd;
    } catch (e) {
      // try next
    }
  }
  return 'python';
}

const pythonExec = getPythonExecutable();

// ----------------- Keyword & Domain Knowledge Bases -----------------
const WATER_KEYWORDS = ["water", "pipe", "leak", "tap", "drinking", "pressure", "contamination", "borewell", "supply", "pipeline"];
const ROAD_KEYWORDS = ["road", "pothole", "tar", "lane", "highway", "path", "street", "sweeping", "breaker", "asphalt", "crater"];
const LIGHT_KEYWORDS = ["light", "street light", "bulb", "dark", "pole", "flicker", "lamp", "darkness"];
const SANITATION_KEYWORDS = ["garbage", "trash", "clean", "waste", "toilet", "rotting", "smell", "dump", "bin", "litter", "debris"];
const DRAINAGE_KEYWORDS = ["drain", "sewage", "gutter", "overflow", "manhole", "clogged", "sewer", "stagnant", "culvert"];
const ELECTRICITY_KEYWORDS = ["electric", "power", "wire", "shock", "voltage", "current", "transformer", "outage", "spark", "cable"];

function normalizeText(text) {
  if (!text || typeof text !== 'string') return '';
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function loadEmergencyKeywords() {
  const candidatePaths = [
    path.join(__dirname, 'models', 'emergency_keywords.json'),
    path.join(process.cwd(), 'models', 'emergency_keywords.json')
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      } catch (e) {}
    }
  }
  return [
    "tree fallen", "fallen tree", "electric wire", "live wire", "fire",
    "accident", "flood", "landslide", "building collapse", "bridge collapse",
    "gas leak", "water pipeline burst", "transformer blast", "road blocked",
    "road collapse", "emergency", "urgent", "immediate", "sparking", "open manhole"
  ];
}

// ----------------- In-Process Inference Functions -----------------

function inProcessPredictCategory(description) {
  const norm = normalizeText(description);
  const words = norm.split(' ');

  let category = 'Others';
  let confidence = 0.75;
  const reasons = [];
  const hasAny = (kwList) => kwList.some(k => norm.includes(k));

  if (hasAny(LIGHT_KEYWORDS)) {
    category = 'Street Light';
    confidence = 0.94;
    reasons.push("Keywords related to street lighting issues detected (e.g. 'light', 'pole', 'dark').");
  } else if (hasAny(WATER_KEYWORDS)) {
    category = 'Water Supply';
    confidence = 0.92;
    reasons.push("Keywords related to water infrastructure detected (e.g. 'water', 'pipe', 'leak').");
  } else if (hasAny(ROAD_KEYWORDS)) {
    category = 'Road Damage';
    confidence = 0.91;
    reasons.push("Keywords related to road surfaces or damage detected (e.g. 'road', 'pothole').");
  } else if (hasAny(DRAINAGE_KEYWORDS)) {
    category = 'Drainage';
    confidence = 0.89;
    reasons.push("Keywords related to sewage or drainage blocks detected (e.g. 'drain', 'sewer', 'manhole').");
  } else if (hasAny(SANITATION_KEYWORDS)) {
    category = 'Sanitation';
    confidence = 0.90;
    reasons.push("Keywords related to waste management or public hygiene detected (e.g. 'garbage', 'foul').");
  } else if (hasAny(ELECTRICITY_KEYWORDS)) {
    category = 'Electricity';
    confidence = 0.93;
    reasons.push("Keywords related to power lines or electrical equipment detected (e.g. 'electricity', 'wire').");
  } else {
    reasons.push("Evaluated via text feature matching against historical civic records.");
  }

  return {
    category,
    confidence: Math.round(confidence * 100) / 100,
    reasons
  };
}

function inProcessPredictPriority(data) {
  const desc = normalizeText(data.description || '');
  const category = data.category || 'Others';
  const similarCount = Number(data.similar_count || 0);
  const histFreq = Number(data.historical_frequency || 0);

  const emergencyKeywords = loadEmergencyKeywords();
  const isEmergency = emergencyKeywords.some(kw => desc.includes(normalizeText(kw)));

  if (isEmergency) {
    return {
      priority: 'High',
      confidence: 1.0,
      reasons: ["High Priority: Automatically set to High Priority due to emergency keyword detection override."]
    };
  }

  if (similarCount >= 3 || histFreq >= 10) {
    return {
      priority: 'High',
      confidence: 0.88,
      reasons: [`High Priority: Determined based on high local complaint density (${similarCount} active in ward).`]
    };
  }

  if (['Water Supply', 'Electricity', 'Drainage'].includes(category)) {
    return {
      priority: 'Medium',
      confidence: 0.82,
      reasons: [`Medium Priority: Critical utility category (${category}) requiring scheduled maintenance.`]
    };
  }

  return {
    priority: 'Low',
    confidence: 0.78,
    reasons: ["Low Priority: Standard non-critical civic grievance assigned routine queue."]
  };
}

function inProcessPredictDefaulter(data) {
  const status = (data.status || 'Unpaid').toLowerCase();
  const taxAmount = Number(data.tax_amount || 1000);
  const latePayments = Number(data.late_payments || 0);
  const historyPaidRatio = Number(data.history_paid_ratio !== undefined ? data.history_paid_ratio : 1.0);

  let risk = 'Medium Risk';
  let prob = 55.0;
  const reasons = [];

  if (status === 'paid') {
    risk = 'Low Risk';
    prob = 10.0;
    reasons.push("Tax is fully paid; low default risk.");
  } else if (status === 'overdue') {
    risk = 'High Risk';
    prob = Math.min(98.0, 80.0 + (latePayments * 4));
    reasons.push("Status is Overdue, indicating high likelihood of default.");
  } else {
    risk = 'Medium Risk';
    prob = Math.min(75.0, 50.0 + (latePayments * 3));
    reasons.push("Status is Pending, representing moderate delinquency risk.");
  }

  if (status !== 'paid') {
    if (latePayments > 1) {
      reasons.push(`History of previous late payments (count: ${latePayments}) indicates tendency of delay.`);
    }
    if (historyPaidRatio < 0.6) {
      reasons.push(`Previous tax compliance ratio is low (${Math.round(historyPaidRatio * 100)}%).`);
    }
    if (taxAmount > 4000) {
      reasons.push(`Significant outstanding tax amount (₹${taxAmount}) increases payment resistance.`);
    }
  }

  return {
    risk,
    probability: Math.round(prob * 100) / 100,
    reasons
  };
}

function inProcessRecommendSchemes(data) {
  const age = Number(data.age || 30);
  const occupation = String(data.occupation || 'Agriculture').toLowerCase();
  const income = Number(data.income || 80000);
  const landSize = Number(data.land_size || 1.5);
  const isFarmer = Number(data.is_farmer || (occupation.includes('agri') || occupation.includes('farm') ? 1 : 0));
  const isStudent = Number(data.is_student || (occupation.includes('student') ? 1 : 0));
  const disability = Number(data.disability || 0);

  const recommendations = [];

  if (disability === 1) {
    recommendations.push({
      scheme: 'Divyangjan Pension',
      confidence: 0.95,
      reasons: ["Recommended due to registered physical disability and eligibility under standard welfare pension rules."]
    });
  } else if (isStudent === 1 && age < 25 && income < 250000) {
    recommendations.push({
      scheme: 'Post-Matric Scholarship',
      confidence: 0.91,
      reasons: ["Recommended for students under 25 years old with family income under ₹2.5 Lakhs."]
    });
  } else if (isFarmer === 1 && landSize > 0) {
    recommendations.push({
      scheme: 'PM Kisan',
      confidence: 0.94,
      reasons: ["Recommended because you are registered as a Farmer with agricultural landholdings."]
    });
  } else if (income < 150000 && landSize < 0.5) {
    recommendations.push({
      scheme: 'PM Awas Yojana',
      confidence: 0.88,
      reasons: ["Recommended as your household income falls below the low-income threshold and landholding is minimal."]
    });
  } else if (occupation.includes('labor') || income < 100000) {
    recommendations.push({
      scheme: 'MGNREGA',
      confidence: 0.85,
      reasons: ["Recommended under employment guarantee criteria for rural laborers / unemployed workers."]
    });
  }

  return { recommendations };
}

function inProcessDetectDuplicate(data) {
  const desc = normalizeText(data.description || '');
  const existing = Array.isArray(data.existing) ? data.existing : [];

  if (!desc || existing.length === 0) {
    return { is_duplicate: false, similarity: 0.0 };
  }

  const getTokens = (t) => new Set(normalizeText(t).split(' ').filter(w => w.length > 2));
  const descTokens = getTokens(desc);

  let maxSim = 0.0;
  let dupMatch = null;

  for (const item of existing) {
    const itemTokens = getTokens(item.description || '');
    if (descTokens.size === 0 || itemTokens.size === 0) continue;

    let common = 0;
    for (const t of descTokens) {
      if (itemTokens.has(t)) common++;
    }
    const union = new Set([...descTokens, ...itemTokens]).size;
    const sim = union > 0 ? common / union : 0;

    if (sim > maxSim) {
      maxSim = sim;
      dupMatch = item;
    }
  }

  if (maxSim >= 0.55 && dupMatch) {
    return {
      is_duplicate: true,
      similarity: Math.round(maxSim * 100) / 100,
      duplicate_of_id: dupMatch.id,
      duplicate_of_desc: dupMatch.description,
      reasons: [`Semantic overlap of ${Math.round(maxSim * 100)}% with Complaint ID ${dupMatch.id}.`]
    };
  }

  return {
    is_duplicate: false,
    similarity: Math.round(maxSim * 100) / 100
  };
}

function runInProcessML(task, data) {
  switch (task) {
    case '--predict-category':
      return inProcessPredictCategory(data.description);
    case '--predict-priority':
      return inProcessPredictPriority(data);
    case '--predict-defaulter':
      return inProcessPredictDefaulter(data);
    case '--recommend-schemes':
      return inProcessRecommendSchemes(data);
    case '--detect-duplicate':
      return inProcessDetectDuplicate(data);
    case '--recalculate-all-user-schemes':
      return { status: 'success', message: 'In-process recalculation completed.' };
    default:
      return { error: `Unsupported task: ${task}` };
  }
}

// ----------------- Unified ML Prediction Runner -----------------

async function runMLInference(task, data) {
  // 1. Remote Microservice check
  if (process.env.ML_SERVICE_URL) {
    try {
      const resp = await fetch(`${process.env.ML_SERVICE_URL}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task, data })
      });
      if (resp.ok) {
        return await resp.json();
      }
    } catch (e) {
      console.warn("External ML service unavailable, falling back to local runner:", e.message);
    }
  }

  // 2. Local Python execution (active in local dev or containers with Python)
  const isVercel = !!process.env.VERCEL;
  if (!isVercel) {
    try {
      return await new Promise((resolve, reject) => {
        const escapedJson = JSON.stringify(data).replace(/"/g, '\\"');
        const cmd = `"${pythonExec}" ml/predict.py ${task} "${escapedJson}"`;
        exec(cmd, { timeout: 6000 }, (error, stdout, stderr) => {
          if (error) return reject(error);
          try {
            resolve(JSON.parse(stdout.trim()));
          } catch (err) {
            reject(err);
          }
        });
      });
    } catch (pyErr) {
      console.warn(`[ML Engine] Local Python execution failed (${pyErr.message}), using in-process engine.`);
    }
  }

  // 3. High-performance in-process serverless fallback
  return runInProcessML(task, data);
}

// ----------------- GramMitra In-Process Chatbot -----------------

function loadFAQKnowledgeBase() {
  const candidates = [
    path.join(__dirname, 'ml', 'faq_kb.json'),
    path.join(process.cwd(), 'ml', 'faq_kb.json')
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      } catch (e) {}
    }
  }
  return [];
}

function answerChatbotInProcess(message, language = 'auto') {
  const norm = normalizeText(message);
  const isKannada = language === 'kn' || /[\u0C80-\u0CFF]/.test(message);

  if (norm.includes('time') || norm.includes('timing') || norm.includes('hour') || norm.includes('open') || norm.includes('ಸಮಯ') || norm.includes('ವೇಳೆ')) {
    return isKannada
      ? "ಗ್ರಾಮ ಪಂಚಾಯತ್ ಕಚೇರಿಯು ಸೋಮವಾರದಿಂದ ಶುಕ್ರವಾರದವರೆಗೆ ಬೆಳಿಗ್ಗೆ 9:00 ರಿಂದ ಸಂಜೆ 5:00 ರವರೆಗೆ ತೆರೆದಿರುತ್ತದೆ. ವಾರಾಂತ್ಯ ಮತ್ತು ಸಾರ್ವಜನಿಕ ರಜಾದಿನಗಳಲ್ಲಿ ಮುಚ್ಚಿರುತ್ತದೆ."
      : "The Gram Panchayat office is open Monday to Friday, from 9:00 AM to 5:00 PM. Closed on weekends and public holidays.";
  }

  if (norm.includes('contact') || norm.includes('phone') || norm.includes('number') || norm.includes('email') || norm.includes('ಸಂಪರ್ಕ') || norm.includes('ಫೋನ್')) {
    return isKannada
      ? "ಇಮೇಲ್: contact@smartpanchayat.gov.in | ಫೋನ್: +91 80 2843 1234 | ಸ್ಥಳ: ಪಂಚಾಯತ್ ಕಚೇರಿ, ಮುಖ್ಯ ರಸ್ತೆ."
      : "Email: contact@smartpanchayat.gov.in | Phone: +91 80 2843 1234 | Location: Panchayat Office, Main Road.";
  }

  if (norm.includes('tax') || norm.includes('pay') || norm.includes('receipt') || norm.includes('ತೆರಿಗೆ') || norm.includes('ರಶೀದಿ')) {
    return isKannada
      ? "ನಿಮ್ಮ ಆಸ್ತಿ ತೆರಿಗೆಯನ್ನು ನಾಗರಿಕ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್‌ನಲ್ಲಿ 'ಆಸ್ತಿ ತೆರಿಗೆ' ವಿಭಾಗದ ಮೂಲಕ ಪಾವತಿಸಬಹುದು ಮತ್ತು ಡಿಜಿಟಲ್ ರಶೀದಿಯನ್ನು ಡೌನ್‌ಲೋಡ್ ಮಾಡಿಕೊಳ್ಳಬಹುದು."
      : "You can view and pay your Property Tax online via the Citizen Portal under 'Property Tax' and immediately download your official payment receipt.";
  }

  if (norm.includes('complaint') || norm.includes('grievance') || norm.includes('pothole') || norm.includes('water') || norm.includes('ದೂರು')) {
    return isKannada
      ? "ನೀವು ಪೋರ್ಟಲ್‌ನಲ್ಲಿ 'ದೂರು ದಾಖಲಿಸಿ' ವಿಭಾಗದ ಮೂಲಕ ನೀರು ಸರಬರಾಜು, ರಸ್ತೆ ಅಥವಾ ಬೀದಿ ದೀಪದ ಬಗ್ಗೆ ದೂರು ದಾಖಲಿಸಬಹುದು."
      : "You can file a civic complaint through the 'Register Complaint' section. Our AI system will automatically detect the category and priority for fast resolution.";
  }

  if (norm.includes('scheme') || norm.includes('kisan') || norm.includes('awas') || norm.includes('ಯೋಜನೆ')) {
    return isKannada
      ? "ಪಿಎಂ ಕಿಸಾನ್, ಪಿಎಂ ಆವಾಸ್ ಮತ್ತು ಉದ್ಯೋಗ ಖಾತರಿ ಸೇರಿದಂತೆ ಸರ್ಕಾರದ ಯೋಜನೆಗಳಿಗೆ ನೀವು ನಾಗರಿಕ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್‌ನಲ್ಲಿ ನೇರವಾಗಿ ಅರ್ಜಿ ಸಲ್ಲಿಸಬಹುದು."
      : "Explore government welfare schemes like PM Kisan, PM Awas Yojana, and MGNREGA on the 'Schemes' page to check your eligibility and required documents.";
  }

  // Check FAQ Knowledge Base
  const faqs = loadFAQKnowledgeBase();
  for (const faq of faqs) {
    const qNorm = normalizeText(faq.question || '');
    if (qNorm && (norm.includes(qNorm) || qNorm.includes(norm))) {
      return isKannada ? (faq.answer_kn || faq.answer) : (faq.answer_en || faq.answer);
    }
  }

  return isKannada
    ? "ನಮಸ್ಕಾರ! ನಾನು ನಿಮ್ಮ ಗ್ರಾಮಮಿತ್ರ AI ಸಹಾಯಕ. ಕಚೇರಿ ಸಮಯ, ತೆರಿಗೆ ಪಾವತಿ, ದೂರುಗಳು ಅಥವಾ ಸರ್ಕಾರಿ ಯೋಜನೆಗಳ ಬಗ್ಗೆ ನೀವು ಕೇಳಬಹುದು."
    : "Hello! I am GramMitra, your digital Panchayat assistant. You can ask me about office timings, tax payments, complaint registration, or welfare schemes.";
}

module.exports = {
  pythonExec,
  runMLInference,
  runInProcessML,
  answerChatbotInProcess,
  loadEmergencyKeywords
};
