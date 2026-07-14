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

def predict_priority(description, category, ward, similar_count=0, is_duplicate=0):
    model = load_pkl('complaint_priority_model.pkl')
    
    if not model:
        pred = "Medium"
        confidence = 1.0
        reasons = ["Default baseline priority"]
    else:
        import pandas as pd
        ward_str = str(ward)
        if not ward_str.startswith("Ward "):
            ward_str = f"Ward {ward_str}"
            
        input_df = pd.DataFrame([{
            'Ward': ward_str,
            'Complaint Category': category,
            'Complaint Description': description,
            'Similar Complaints in Same Ward': similar_count,
            'Status': 'Pending'  # New complaints default to Pending status
        }])
        
        try:
            pred = model.predict(input_df)[0]
            probs = model.predict_proba(input_df)[0]
            confidence = float(np.max(probs))
        except Exception as e:
            pred = "Medium"
            confidence = 0.5
            print(f"Prediction failed: {e}", file=sys.stderr)
            
        # Apply final priority rules
        emergency_keywords = [
            "live electric wire", "electric pole sparking", "transformer blast", "fire",
            "gas leak", "road collapse", "pipeline burst", "sewage overflow", "flooding",
            "tree fallen blocking road", "dangerous open manhole"
        ]
        desc_lower = description.lower()
        is_emergency = any(k in desc_lower for k in emergency_keywords) or \
                       "life-threatening" in desc_lower or \
                       "life threatening" in desc_lower or \
                       "accident hazard" in desc_lower or \
                       "electrocution" in desc_lower
                       
        if is_emergency:
            pred = "High"
            reasons = ["Automatically set to High Priority due to emergency keyword detection."]
        else:
            if similar_count == 1:
                pred = "Medium"
                reasons = [f"Assigned Medium Priority due to 2 similar complaints in {ward_str}."]
            elif similar_count >= 2:
                pred = "High"
                reasons = [f"Assigned High Priority due to {similar_count + 1} similar complaints in {ward_str}."]
            else:
                pred = "Low"
                reasons = [f"Assigned Low Priority due to 1 complaint in {ward_str}."]
        confidence = 1.0

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
        similar = int(data.get("similar_count", 0))
        is_dup = int(data.get("is_duplicate", 0))
        result = predict_priority(desc, cat, ward, similar, is_dup)

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
