import os
import sys
import json
import pickle
import pandas as pd
import numpy as np
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Directories
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(BASE_DIR, 'models')

# Load Pickled Models safely
def load_pkl(filename):
    path = os.path.join(MODELS_DIR, filename)
    if os.path.exists(path):
        with open(path, 'rb') as f:
            return pickle.load(f)
    return None

# XAI Keywords
HIGH_PRIO_KEYWORDS = ["burst", "danger", "overflow", "accident", "broken", "wire", "rotting", "flood", "child", "kids", "blocking", "foul", "death", "hazard", "spark", "shock", "live wire", "open manhole"]
WATER_KEYWORDS = ["water", "pipe", "leak", "tap", "drinking", "pressure", "contamination", "borewell"]
ROAD_KEYWORDS = ["road", "pothole", "tar", "lane", "highway", "path", "street", "sweeping", "breaker"]
LIGHT_KEYWORDS = ["light", "street light", "bulb", "dark", "pole", "flicker"]
SANITATION_KEYWORDS = ["garbage", "trash", "clean", "waste", "toilet", "rotting", "smell", "dump", "bin"]
DRAINAGE_KEYWORDS = ["drain", "sewage", "gutter", "overflow", "manhole", "clogged", "sewer"]
ELECTRICITY_KEYWORDS = ["electric", "power", "wire", "shock", "voltage", "current", "transformer", "outage"]

# ----------------- Category Suggestion -----------------
def predict_category(description):
    model = load_pkl('complaint_category_model.pkl')
    vec = load_pkl('complaint_category_vectorizer.pkl')
    
    if not model or not vec:
        return {"category": "Others", "confidence": 1.0, "reasons": ["Baseline classification (models not initialized)"]}
        
    vec_desc = vec.transform([description])
    pred = model.predict(vec_desc)[0]
    probs = model.predict_proba(vec_desc)[0]
    confidence = float(np.max(probs))
    
    # XAI Reasons
    reasons = []
    desc_lower = description.lower()
    
    if pred == "Water Supply" and any(k in desc_lower for k in WATER_KEYWORDS):
        reasons.append("Keywords related to water infrastructure detected (e.g. 'water', 'pipe', 'leak').")
    elif pred == "Road Damage" and any(k in desc_lower for k in ROAD_KEYWORDS):
        reasons.append("Keywords related to road surfaces or damage detected (e.g. 'road', 'pothole').")
    elif pred == "Street Light" and any(k in desc_lower for k in LIGHT_KEYWORDS):
        reasons.append("Keywords related to street lighting issues detected (e.g. 'light', 'pole', 'dark').")
    elif pred == "Sanitation" and any(k in desc_lower for k in SANITATION_KEYWORDS):
        reasons.append("Keywords related to waste management or public hygiene detected (e.g. 'garbage', 'foul').")
    elif pred == "Drainage" and any(k in desc_lower for k in DRAINAGE_KEYWORDS):
        reasons.append("Keywords related to sewage or drainage blocks detected (e.g. 'drain', 'sewer', 'manhole').")
    elif pred == "Electricity" and any(k in desc_lower for k in ELECTRICITY_KEYWORDS):
        reasons.append("Keywords related to power lines or electrical equipment detected (e.g. 'electricity', 'wire').")
    else:
        reasons.append("Semantic text matches historical complaints in this category.")
        
    return {
        "category": pred,
        "confidence": round(confidence, 2),
        "reasons": reasons
    }

# ----------------- Priority Prediction -----------------
def predict_priority(description, category, ward):
    model = load_pkl('complaint_priority_model.pkl')
    vec = load_pkl('complaint_priority_vectorizer.pkl')
    
    if not model or not vec:
        return {"priority": "Medium", "confidence": 1.0, "reasons": ["Default baseline priority"]}
        
    vec_desc = vec.transform([description])
    pred = model.predict(vec_desc)[0]
    probs = model.predict_proba(vec_desc)[0]
    confidence = float(np.max(probs))
    
    # XAI Reasons
    reasons = []
    desc_lower = description.lower()
    
    if pred == "High":
        matched_k = [k for k in HIGH_PRIO_KEYWORDS if k in desc_lower]
        if matched_k:
            reasons.append(f"High-severity threat warning keywords detected: {', '.join(matched_k[:3])}.")
        if category in ["Electricity", "Water Supply", "Drainage"]:
            reasons.append(f"Critical public utility category ('{category}') increases urgency rating.")
        if not reasons:
            reasons.append("Semantic analysis indicates immediate resolution is required.")
    elif pred == "Medium":
        reasons.append("The issue requires prompt maintenance, but does not present an immediate safety hazard.")
    else: # Low
        reasons.append("Request is classified as general public inquiry, request for new installations, or routine sweeping.")
        
    return {
        "priority": pred,
        "confidence": round(confidence, 2),
        "reasons": reasons
    }

# ----------------- Scheme Recommendation -----------------
def recommend_schemes(age, gender, occupation, income, land_size, is_farmer, is_student, disability):
    model = load_pkl('scheme_model.pkl')
    mappings = load_pkl('scheme_mappings.pkl')
    
    if not model or not mappings:
        return {"recommendations": []}
        
    gender_map = mappings.get("gender_map", {})
    occ_map = mappings.get("occ_map", {})
    
    # Encode inputs
    gender_enc = gender_map.get(gender, 2) # default to Other
    occ_enc = occ_map.get(occupation, 5) # default to Other
    
    # Input vector: age, gender, occupation, income, land_size, is_farmer, is_student, disability
    features = np.array([[age, gender_enc, occ_enc, income, land_size, is_farmer, is_student, disability]])
    
    probs = model.predict_proba(features)[0]
    classes = model.classes_
    
    recs = []
    for cls, prob in zip(classes, probs):
        if cls == "None" or prob < 0.05:
            continue
            
        # Determine XAI reason based on scheme
        reasons = []
        if cls == "PM Kisan":
            reasons.append("Recommended because you are registered as a Farmer with agricultural landholdings.")
        elif cls == "PM Awas Yojana":
            reasons.append("Recommended as your household income falls below the low-income threshold and landholding is minimal.")
        elif cls == "MGNREGA":
            reasons.append("Recommended under employment guarantee criteria for rural laborers / unemployed workers.")
        elif cls == "Post-Matric Scholarship":
            reasons.append("Recommended for students under 25 years old with family income under ₹2.0 Lakhs.")
        elif cls == "Divyangjan Pension":
            reasons.append("Recommended due to registered physical disability and eligibility under standard welfare pension rules.")
        else:
            reasons.append("Meets demographic profile matching historical recipients.")
            
        recs.append({
            "scheme": cls,
            "confidence": round(float(prob), 2),
            "reasons": reasons
        })
        
    # Sort by confidence descending
    recs = sorted(recs, key=lambda x: x['confidence'], reverse=True)
    return {"recommendations": recs}

# ----------------- Tax Defaulter Risk -----------------
def predict_defaulter(property_type, tax_amount, year, history_paid_ratio, late_payments):
    model = load_pkl('tax_defaulter_model.pkl')
    
    if not model:
        return {"risk": "Low Risk", "probability": 0.0, "reasons": ["Default baseline tax risk"]}
        
    # Features: property_type, tax_amount, history_paid_ratio, late_payments
    # Note: property_type should be encoded (Residential=0, Commercial=1)
    p_type_enc = 1 if property_type.lower() == 'commercial' else 0
    
    features = np.array([[p_type_enc, tax_amount, history_paid_ratio, late_payments]])
    
    # Model predict defaulter prob (defaulter = 1)
    probs = model.predict_proba(features)[0]
    classes = model.classes_
    
    defaulter_idx = np.where(classes == 1)[0][0]
    prob_defaulter = float(probs[defaulter_idx])
    
    # Categorize Risk
    if prob_defaulter < 0.35:
        risk = "Low Risk"
    elif prob_defaulter <= 0.70:
        risk = "Medium Risk"
    else:
        risk = "High Risk"
        
    # XAI Reasons
    reasons = []
    if late_payments > 1:
        reasons.append(f"History of previous late payments (count: {late_payments}) indicates high tendency of delay.")
    if history_paid_ratio < 0.6:
        reasons.append(f"Previous tax compliance ratio is low ({history_paid_ratio:.1%}).")
    if tax_amount > 4000:
        reasons.append(f"Significant outstanding tax amount (₹{tax_amount}) increases payment resistance.")
    if not reasons:
        reasons.append("Compliance history and tax metrics match typical low-risk profiles.")
        
    return {
        "risk": risk,
        "probability": round(prob_defaulter * 100, 2),
        "reasons": reasons
    }

# ----------------- Duplicate Complaint Detection -----------------
def detect_duplicate(description, category, existing_complaints):
    # existing_complaints: list of dicts with {"id": ..., "description": ...}
    if not existing_complaints or len(existing_complaints) == 0:
        return {"is_duplicate": False, "similarity": 0.0}
        
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity
    
    descriptions = [description] + [c['description'] for c in existing_complaints]
    
    vec = TfidfVectorizer(stop_words='english')
    try:
        tfidf = vec.fit_transform(descriptions)
    except Exception:
        return {"is_duplicate": False, "similarity": 0.0}
        
    # Compare description (index 0) with all other complaints (indices 1 to N)
    sims = cosine_similarity(tfidf[0:1], tfidf[1:])[0]
    
    max_idx = np.argmax(sims)
    max_sim = float(sims[max_idx])
    
    if max_sim > 0.70:
        dup = existing_complaints[max_idx]
        return {
            "is_duplicate": True,
            "similarity": round(max_sim, 2),
            "duplicate_of_id": dup['id'],
            "duplicate_of_desc": dup['description'],
            "reasons": [f"Cosine similarity is high ({max_sim:.1%}) compared to Complaint ID {dup['id']}."]
        }
        
    return {"is_duplicate": False, "similarity": round(max_sim, 2)}

# ----------------- Main CLI Handler -----------------
def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Missing task and data arguments"}))
        return
        
    task = sys.argv[1]
    data_str = sys.argv[2]
    
    try:
        data = json.loads(data_str)
    except Exception as e:
        print(json.dumps({"error": f"Invalid input JSON data: {e}"}))
        return
        
    result = {}
    
    if task == "--predict-category":
        desc = data.get("description", "")
        result = predict_category(desc)
        
    elif task == "--predict-priority":
        desc = data.get("description", "")
        cat = data.get("category", "Others")
        ward = data.get("ward", "Ward 1")
        result = predict_priority(desc, cat, ward)
        
    elif task == "--recommend-schemes":
        age = int(data.get("age", 30))
        gender = data.get("gender", "Male")
        occ = data.get("occupation", "Agriculture")
        income = float(data.get("income", 80000.0))
        land = float(data.get("land_size", 1.5))
        is_farmer = int(data.get("is_farmer", 1))
        is_student = int(data.get("is_student", 0))
        disability = int(data.get("disability", 0))
        result = recommend_schemes(age, gender, occ, income, land, is_farmer, is_student, disability)
        
    elif task == "--predict-defaulter":
        p_type = data.get("property_type", "Residential")
        amount = float(data.get("tax_amount", 1000.0))
        year = int(data.get("year", 2026))
        hist_ratio = float(data.get("history_paid_ratio", 1.0))
        late_pays = int(data.get("late_payments", 0))
        result = predict_defaulter(p_type, amount, year, hist_ratio, late_pays)
        
    elif task == "--detect-duplicate":
        desc = data.get("description", "")
        cat = data.get("category", "")
        existing = data.get("existing", [])
        result = detect_duplicate(desc, cat, existing)
        
    else:
        result = {"error": f"Unknown task: {task}"}
        
    print(json.dumps(result))

if __name__ == "__main__":
    main()
