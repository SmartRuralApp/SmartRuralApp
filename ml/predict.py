import os
import sys
import json
import pickle
import pandas as pd
import numpy as np
import io
import sqlite3

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

# Load emergency keywords from config
def load_emergency_keywords():
    kw_path = os.path.join(MODELS_DIR, 'emergency_keywords.json')
    if os.path.exists(kw_path):
        try:
            with open(kw_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return [
        "tree fallen", "fallen tree", "electric wire", "live wire", "fire",
        "accident", "flood", "landslide", "building collapse", "bridge collapse",
        "gas leak", "water pipeline burst", "transformer blast", "road blocked",
        "road collapse", "emergency", "urgent", "immediate"
    ]

def check_emergency(desc):
    desc_lower = str(desc).lower()
    keywords = load_emergency_keywords()
    return 1 if any(kw in desc_lower for kw in keywords) else 0

def predict_priority(description, category, ward, similar_count=0, is_duplicate=0, historical_frequency=0):
    model = load_pkl('complaint_priority_model.pkl')
    
    # 1. Run emergency keyword detection
    emergency_val = check_emergency(description)
    
    # Format ward string
    ward_str = str(ward)
    if not ward_str.startswith("Ward "):
        ward_str = f"Ward {ward_str}"
        
    input_df = pd.DataFrame([{
        'Ward': ward_str,
        'Complaint Category': category,
        'Complaint Description': description,
        'Similar Complaints in Same Ward': similar_count,
        'Emergency Keywords': emergency_val,
        'Historical complaint frequency': historical_frequency
    }])
    
    # 2. Run ML model prediction if loaded
    ml_pred = "Medium"
    confidence = 1.0
    if model:
        try:
            ml_pred = model.predict(input_df)[0]
            probs = model.predict_proba(input_df)[0]
            confidence = float(np.max(probs))
        except Exception as e:
            ml_pred = "Medium"
            confidence = 0.5
            print(f"Prediction failed: {e}", file=sys.stderr)
            
    # 3. Combine emergency detection and ML prediction
    # If emergency keywords are detected, automatically override to High Priority (3)
    if emergency_val == 1:
        pred = "High"
        reasons = ["High Priority: Automatically set to High Priority due to emergency keyword detection override."]
        confidence = 1.0
    else:
        # If no emergency keyword is detected, use the ML model prediction normally
        pred = ml_pred
        reasons = [f"ML Model Prediction: Determined as {pred} Priority based on text features."]
            
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
    
    # Input vector: age, gender, occupation, income, land_size, is_farmer, is_student, disability, income_per_acre
    income_per_acre = float(income) / (float(land_size) + 0.1)
    features = np.array([[age, gender_enc, occ_enc, income, land_size, is_farmer, is_student, disability, income_per_acre]])
    
    probs = model.predict_proba(features)[0]
    classes = model.classes_
    
    valid_recs = []
    for cls, prob in zip(classes, probs):
        if cls != "None":
            valid_recs.append((cls, float(prob)))
            
    valid_recs = sorted(valid_recs, key=lambda x: x[1], reverse=True)
    
    recs = []
    if len(valid_recs) > 0 and valid_recs[0][1] >= 0.70:
        cls, prob = valid_recs[0]
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
            "confidence": round(prob, 2),
            "reasons": reasons
        })
        
    return {"recommendations": recs}

# ----------------- Recalculate All User Schemes -----------------
def recalculate_all_user_schemes():
    db_path = os.path.join(BASE_DIR, 'data', 'panchayat.db')
    if not os.path.exists(db_path):
        return {"status": "error", "message": f"Database not found at {db_path}"}
        
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        cursor.execute("PRAGMA table_info(users)")
        cols = [col[1] for col in cursor.fetchall()]
        if "matching_scheme" not in cols or "matching_confidence" not in cols:
            try:
                cursor.execute("ALTER TABLE users ADD COLUMN matching_scheme TEXT DEFAULT 'No Matching Scheme'")
                cursor.execute("ALTER TABLE users ADD COLUMN matching_confidence REAL DEFAULT 0.0")
                conn.commit()
            except Exception:
                pass
                
        cursor.execute("SELECT id, age, gender, occupation, income, land_size, is_farmer, is_student, disability FROM users")
        users = cursor.fetchall()
        
        updated_count = 0
        for u in users:
            uid, age, gender, occ, income, land, is_farmer, is_student, disability = u
            
            res = recommend_schemes(
                age=int(age or 30),
                gender=gender or "Male",
                occupation=occ or "Agriculture",
                income=float(income or 80000.0),
                land_size=float(land or 1.5),
                is_farmer=int(is_farmer or 0),
                is_student=int(is_student or 0),
                disability=int(disability or 0)
            )
            
            recs = res.get("recommendations", [])
            if len(recs) > 0:
                scheme_name = recs[0]["scheme"]
                confidence = float(recs[0]["confidence"])
            else:
                scheme_name = "No Matching Scheme"
                confidence = 0.0
                
            cursor.execute(
                "UPDATE users SET matching_scheme = ?, matching_confidence = ? WHERE id = ?",
                (scheme_name, confidence, uid)
            )
            updated_count += 1
            
        conn.commit()
        conn.close()
        return {"status": "success", "updated_users": updated_count}
    except Exception as e:
        return {"status": "error", "message": str(e)}

# ----------------- Tax Defaulter Risk -----------------
def predict_defaulter(property_type, tax_amount, year, history_paid_ratio, late_payments, status="Unpaid"):
    model = load_pkl('tax_defaulter_model.pkl')
    scaler = load_pkl('tax_scaler.pkl')
    
    prob_percent = 0.0
    if model:
        try:
            p_type_enc = 1 if property_type.lower() == 'commercial' else 0
            # Feature engineering
            tax_per_late_payment = tax_amount * late_payments
            payment_risk_index = (1.0 - history_paid_ratio) * late_payments
            
            raw_features = np.array([[p_type_enc, tax_amount, history_paid_ratio, late_payments, tax_per_late_payment, payment_risk_index]])
            if scaler:
                features = scaler.transform(raw_features)
            else:
                features = raw_features
                
            probs = model.predict_proba(features)[0]
            classes = model.classes_
            defaulter_idx = np.where(classes == 1)[0][0]
            prob_defaulter = float(probs[defaulter_idx])
            prob_percent = prob_defaulter * 100
        except Exception as e:
            print("Defaulter prediction error:", e, file=sys.stderr)
            pass

    # Status-based Risk Mapping
    status_lower = status.lower()
    if status_lower == 'paid':
        risk = "Low Risk"
        prob_percent = max(5.0, min(25.0, prob_percent))
        reasons = ["Tax is fully paid; low default risk."]
    elif status_lower == 'overdue':
        risk = "High Risk"
        prob_percent = max(75.0, min(98.0, prob_percent))
        reasons = ["Status is Overdue, indicating high likelihood of default."]
    elif status_lower in ['pending', 'unpaid']:
        risk = "Medium Risk"
        prob_percent = max(45.0, min(70.0, prob_percent))
        reasons = ["Status is Pending, representing moderate delinquency risk."]
    else:
        risk = "Medium Risk"
        prob_percent = max(45.0, min(70.0, prob_percent))
        reasons = ["Status is Pending, representing moderate delinquency risk."]

    if status.lower() != 'paid':
        if late_payments > 1:
            reasons.append(f"History of previous late payments (count: {late_payments}) indicates tendency of delay.")
        if history_paid_ratio < 0.6:
            reasons.append(f"Previous tax compliance ratio is low ({history_paid_ratio:.1%}).")
        if tax_amount > 4000:
            reasons.append(f"Significant outstanding tax amount (₹{tax_amount}) increases payment resistance.")
    
    if not reasons:
        reasons.append("Compliance history and tax metrics match typical profiles.")
        
    return {
        "risk": risk,
        "probability": round(prob_percent, 2),
        "reasons": reasons
    }

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
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing task argument"}))
        return
        
    task = sys.argv[1]
    if task == "--recalculate-all-user-schemes":
        result = recalculate_all_user_schemes()
        print(json.dumps(result))
        return
        
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Missing data argument"}))
        return
        
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
        similar = int(data.get("similar_count", 0))
        is_dup = int(data.get("is_duplicate", 0))
        hist_freq = int(data.get("historical_frequency", 0))
        result = predict_priority(desc, cat, ward, similar, is_dup, hist_freq)

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
        status = data.get("status", "Unpaid")
        result = predict_defaulter(p_type, amount, year, hist_ratio, late_pays, status)
        
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
