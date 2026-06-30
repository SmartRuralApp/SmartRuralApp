import os
import sys
import json
import datetime
import pickle
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.naive_bayes import MultinomialNB
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix

# Directories
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASETS_DIR = os.path.join(BASE_DIR, 'datasets')
MODELS_DIR = os.path.join(BASE_DIR, 'models')

os.makedirs(DATASETS_DIR, exist_ok=True)
os.makedirs(MODELS_DIR, exist_ok=True)

# File Paths
COMPLAINTS_FILE = os.path.join(DATASETS_DIR, 'complaints_dataset.xlsx')
TAX_FILE = os.path.join(DATASETS_DIR, 'tax_dataset.xlsx')
SCHEMES_FILE = os.path.join(DATASETS_DIR, 'schemes_dataset.xlsx')
METADATA_FILE = os.path.join(MODELS_DIR, 'metadata.json')

# ----------------- 1. Dataset Generation (Run once) -----------------
def generate_seed_datasets():
    # A. Complaints Seed Data
    if not os.path.exists(COMPLAINTS_FILE):
        print("Generating complaints seed dataset...")
        templates = [
            ("Main pipeline burst near Ward 2, water flooding the road.", "Water Supply", "High"),
            ("Drinking water pipeline leakage near school, urgent repair needed.", "Water Supply", "High"),
            ("Low water pressure in municipal tap for past three days.", "Water Supply", "Medium"),
            ("Water supply contaminated with mud and smell.", "Water Supply", "Medium"),
            ("Request for new water connection in Block B.", "Water Supply", "Low"),
            ("Water supply timing is irregular in Ward 1.", "Water Supply", "Low"),
            
            ("Huge pothole in front of school is causing accidents.", "Road Damage", "High"),
            ("Main road caved in near temple, road is blocked.", "Road Damage", "High"),
            ("Road tarring peeling off near bus stop.", "Road Damage", "Medium"),
            ("Speed breaker paint is faded, causing accidents at night.", "Road Damage", "Medium"),
            ("Need road sweeping on Block A road.", "Road Damage", "Low"),
            ("Request for repairing side walking path.", "Road Damage", "Low"),
            
            ("All street lights in Ward 4 are non-functional, dangerous at night.", "Street Light", "High"),
            ("Dark street near community hall, high risk of theft.", "Street Light", "High"),
            ("Single street light flickering near temple.", "Street Light", "Medium"),
            ("Street light pole bent and leaning towards road.", "Street Light", "Medium"),
            ("Request for extra street light pole near park.", "Street Light", "Low"),
            ("Request for timer switch installation on street lights.", "Street Light", "Low"),
            
            ("Dead animal rotting in the drainage channel near market, foul smell.", "Sanitation", "High"),
            ("Garbage accumulation near water source, high risk of disease outbreak.", "Sanitation", "High"),
            ("Garbage bin overflowing and not cleared for three days.", "Sanitation", "Medium"),
            ("Public toilet is blocked and overflowing.", "Sanitation", "Medium"),
            ("Plaza cleaning requested.", "Sanitation", "Low"),
            ("Need more dustbins installed in market area.", "Sanitation", "Low"),
            
            ("Blocked main sewer line causing sewage water to overflow onto streets.", "Drainage", "High"),
            ("Open manhole on main road, major hazard for kids.", "Drainage", "High"),
            ("Blocked storm water drain causing minor logging after rain.", "Drainage", "Medium"),
            ("Drainage cover cracked, needs replacement.", "Drainage", "Medium"),
            ("Drain cleaning requested before monsoon.", "Drainage", "Low"),
            ("Request for laying closed drainage pipes in Block C.", "Drainage", "Low"),
            
            ("Live electric wire hanging dangerously low near school gate.", "Electricity", "High"),
            ("Electric spark from transformer near houses.", "Electricity", "High"),
            ("Flickering power line causing appliance issues.", "Electricity", "Medium"),
            ("Power outage in Block D for past 6 hours without explanation.", "Electricity", "Medium"),
            ("Request for transformer fencing to prevent animal accidents.", "Electricity", "Low"),
            ("Request for changing old electricity meter.", "Electricity", "Low"),
            
            ("Stray dogs attacking school children near playground.", "Others", "High"),
            ("Wild boar entry from forest area, destroying crops.", "Others", "High"),
            ("Loud music played late at night in wedding hall.", "Others", "Medium"),
            ("Encroachment of public footpath by local vendors.", "Others", "Medium"),
            ("Request for library membership card process info.", "Others", "Low"),
            ("Information needed on playground booking.", "Others", "Low")
        ]
        
        # Expand to 160 records with variations
        expanded = []
        wards = ["Ward 1", "Ward 2", "Ward 3", "Ward 4", "Ward 5"]
        adjectives = ["immediately", "please help", "since yesterday", "as soon as possible", "urgently", "this is serious"]
        
        for i in range(160):
            tpl = templates[i % len(templates)]
            desc = tpl[0]
            # Add variation
            ward = wards[i % len(wards)]
            adj = adjectives[i % len(adjectives)]
            
            # Simple word swap or appendage
            if i % 3 == 0:
                final_desc = f"{desc} Located in {ward}."
            elif i % 3 == 1:
                final_desc = f"{desc} Please fix it {adj}."
            else:
                final_desc = f"{adj}: {desc} ({ward})"
                
            expanded.append({
                "id": f"C_SEED_{i+1}",
                "description": final_desc,
                "category": tpl[1],
                "priority": tpl[2]
            })
            
        df = pd.DataFrame(expanded)
        df.to_excel(COMPLAINTS_FILE, index=False)
        print(f"Saved {len(df)} records to {COMPLAINTS_FILE}")

    # B. Tax Seed Data
    if not os.path.exists(TAX_FILE):
        print("Generating tax seed dataset...")
        records = []
        # Features: property_type (Residential=0, Commercial=1), tax_amount, year, history_paid_ratio, late_payments
        np.random.seed(42)
        for i in range(180):
            p_type = np.random.choice([0, 1], p=[0.75, 0.25]) # 75% Residential, 25% Commercial
            tax_amount = round(float(np.random.uniform(500, 10000)), 2)
            year = np.random.choice([2024, 2025, 2026])
            
            # Default logic: high late payments and low history ratio -> defaulter
            if p_type == 1: # Commercial
                late_payments = int(np.random.choice([0, 1, 2, 3], p=[0.6, 0.2, 0.1, 0.1]))
                history_paid_ratio = float(np.random.choice([1.0, 0.8, 0.5, 0.0], p=[0.7, 0.15, 0.1, 0.05]))
            else: # Residential
                late_payments = int(np.random.choice([0, 1, 2, 3, 4], p=[0.5, 0.25, 0.15, 0.07, 0.03]))
                history_paid_ratio = float(np.random.choice([1.0, 0.75, 0.5, 0.0], p=[0.6, 0.2, 0.1, 0.1]))
                
            # Default probability formula
            score = (late_payments * 0.45) + ((1.0 - history_paid_ratio) * 0.45) + (tax_amount / 10000.0 * 0.1)
            is_defaulter = 1 if score > 0.4 else 0
            
            records.append({
                "id": f"T_SEED_{i+1}",
                "property_type": p_type,
                "tax_amount": tax_amount,
                "year": year,
                "history_paid_ratio": history_paid_ratio,
                "late_payments": late_payments,
                "is_defaulter": is_defaulter
            })
            
        df = pd.DataFrame(records)
        df.to_excel(TAX_FILE, index=False)
        print(f"Saved {len(df)} records to {TAX_FILE}")

    # C. Schemes Seed Data
    if not os.path.exists(SCHEMES_FILE):
        print("Generating schemes seed dataset...")
        records = []
        # Features: age, gender, occupation, income, land_size, is_farmer, is_student, disability
        occupations = ["Agriculture", "Laborer", "Business", "Unemployed", "Student", "Other"]
        genders = ["Male", "Female", "Other"]
        
        np.random.seed(42)
        for i in range(160):
            age = int(np.random.randint(18, 75))
            gender = np.random.choice(genders, p=[0.49, 0.49, 0.02])
            disability = int(np.random.choice([0, 1], p=[0.93, 0.07]))
            
            if age < 24 and np.random.choice([True, False], p=[0.6, 0.4]):
                is_student = 1
                occupation = "Student"
                income = round(float(np.random.uniform(10000, 150000)), 2)
                land_size = 0.0
                is_farmer = 0
            else:
                is_student = 0
                occupation = np.random.choice(["Agriculture", "Laborer", "Business", "Unemployed", "Other"], p=[0.5, 0.25, 0.15, 0.05, 0.05])
                income = round(float(np.random.uniform(20000, 450000)), 2)
                is_farmer = 1 if occupation == "Agriculture" else int(np.random.choice([0, 1], p=[0.8, 0.2]))
                land_size = round(float(np.random.uniform(0.0, 8.0)), 2) if is_farmer == 1 else round(float(np.random.uniform(0.0, 0.5)), 2)
                
            # Rule based labeling
            if disability == 1 and income < 120000:
                scheme = "Divyangjan Pension"
            elif is_student == 1 and income < 200000 and age < 25:
                scheme = "Post-Matric Scholarship"
            elif is_farmer == 1 and land_size > 0 and occupation == "Agriculture":
                scheme = "PM Kisan"
            elif income < 150000 and land_size < 0.5:
                scheme = "PM Awas Yojana"
            elif occupation == "Laborer" or income < 100000:
                scheme = "MGNREGA"
            else:
                scheme = "None"
                
            records.append({
                "id": f"S_SEED_{i+1}",
                "age": age,
                "gender": gender,
                "occupation": occupation,
                "income": income,
                "land_size": land_size,
                "is_farmer": is_farmer,
                "is_student": is_student,
                "disability": disability,
                "recommended_scheme": scheme
            })
            
        df = pd.DataFrame(records)
        df.to_excel(SCHEMES_FILE, index=False)
        print(f"Saved {len(df)} records to {SCHEMES_FILE}")

# ----------------- 2. Retraining & Merging Database -----------------
def merge_database_data(payload_json):
    try:
        data = json.loads(payload_json)
    except Exception as e:
        print(f"Error parsing JSON payload: {e}")
        return False
        
    print("Merging new database records into Excel datasets...")

    # Merge complaints
    if 'complaints' in data and len(data['complaints']) > 0:
        db_df = pd.DataFrame(data['complaints'])
        # Rename columns if needed
        # Expected: id, description, category, priority
        if os.path.exists(COMPLAINTS_FILE):
            ex_df = pd.read_excel(COMPLAINTS_FILE)
            # Ensure ID column exists
            if 'id' not in ex_df.columns:
                ex_df['id'] = [f"C_EX_{x}" for x in range(len(ex_df))]
            
            # Merge on ID: overwrite existing or append new
            ex_df.set_index('id', inplace=True)
            db_df.set_index('id', inplace=True)
            ex_df.update(db_df)
            # Find rows not in ex_df
            new_rows = db_df[~db_df.index.isin(ex_df.index)]
            ex_df = pd.concat([ex_df, new_rows])
            ex_df.reset_index(inplace=True)
            ex_df.to_excel(COMPLAINTS_FILE, index=False)
            print(f"Merged {len(data['complaints'])} complaints.")
            
    # Merge taxes
    if 'taxes' in data and len(data['taxes']) > 0:
        db_df = pd.DataFrame(data['taxes'])
        if os.path.exists(TAX_FILE):
            ex_df = pd.read_excel(TAX_FILE)
            if 'id' not in ex_df.columns:
                ex_df['id'] = [f"T_EX_{x}" for x in range(len(ex_df))]
                
            ex_df.set_index('id', inplace=True)
            db_df.set_index('id', inplace=True)
            ex_df.update(db_df)
            new_rows = db_df[~db_df.index.isin(ex_df.index)]
            ex_df = pd.concat([ex_df, new_rows])
            ex_df.reset_index(inplace=True)
            ex_df.to_excel(TAX_FILE, index=False)
            print(f"Merged {len(data['taxes'])} taxes.")

    # Merge users (schemes recommendation data)
    if 'users' in data and len(data['users']) > 0:
        db_df = pd.DataFrame(data['users'])
        if os.path.exists(SCHEMES_FILE):
            ex_df = pd.read_excel(SCHEMES_FILE)
            if 'id' not in ex_df.columns:
                ex_df['id'] = [f"S_EX_{x}" for x in range(len(ex_df))]
                
            ex_df.set_index('id', inplace=True)
            db_df.set_index('id', inplace=True)
            ex_df.update(db_df)
            new_rows = db_df[~db_df.index.isin(ex_df.index)]
            ex_df = pd.concat([ex_df, new_rows])
            ex_df.reset_index(inplace=True)
            ex_df.to_excel(SCHEMES_FILE, index=False)
            print(f"Merged {len(data['users'])} user/scheme records.")
            
    return True

# Helper to format confusion matrix as JSON-serializable list
def clean_cm(cm):
    return cm.tolist()

# ----------------- 3. Training ML Models -----------------
def train_models():
    print("Starting ML Model training...")
    metadata = {}
    
    # Check model version
    current_version = 1
    if os.path.exists(METADATA_FILE):
        try:
            with open(METADATA_FILE, 'r') as f:
                old_meta = json.load(f)
                current_version = old_meta.get("version", 0) + 1
        except Exception:
            pass
            
    metadata["version"] = current_version
    metadata["last_trained"] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    metadata["models"] = {}

    # MODEL A & B: Complaints Category & Priority
    if os.path.exists(COMPLAINTS_FILE):
        print("Training Complaints Models...")
        df = pd.read_excel(COMPLAINTS_FILE)
        df = df.dropna(subset=['description', 'category', 'priority'])
        
        X = df['description']
        y_cat = df['category']
        y_prio = df['priority']
        
        metadata["models"]["complaint_category"] = {"dataset_size": len(df)}
        metadata["models"]["complaint_priority"] = {"dataset_size": len(df)}
        
        # 1. Category Classifier (TF-IDF + LogisticRegression)
        X_train, X_test, y_train_cat, y_test_cat = train_test_split(X, y_cat, test_size=0.2, random_state=42)
        
        vec_cat = TfidfVectorizer(max_features=1000, stop_words='english')
        X_train_vec = vec_cat.fit_transform(X_train)
        X_test_vec = vec_cat.transform(X_test)
        
        model_cat = LogisticRegression(max_iter=500, random_state=42)
        model_cat.fit(X_train_vec, y_train_cat)
        
        preds_cat = model_cat.predict(X_test_vec)
        
        # Metrics
        cat_acc = accuracy_score(y_test_cat, preds_cat)
        cat_precision = precision_score(y_test_cat, preds_cat, average='weighted', zero_division=0)
        cat_recall = recall_score(y_test_cat, preds_cat, average='weighted', zero_division=0)
        cat_f1 = f1_score(y_test_cat, preds_cat, average='weighted', zero_division=0)
        cat_cm = confusion_matrix(y_test_cat, preds_cat)
        
        metadata["models"]["complaint_category"].update({
            "accuracy": round(cat_acc, 4),
            "precision": round(cat_precision, 4),
            "recall": round(cat_recall, 4),
            "f1_score": round(cat_f1, 4),
            "confusion_matrix": clean_cm(cat_cm),
            "classes": model_cat.classes_.tolist()
        })
        
        # 2. Priority Classifier (TF-IDF + MultinomialNB)
        X_train, X_test, y_train_prio, y_test_prio = train_test_split(X, y_prio, test_size=0.2, random_state=42)
        
        vec_prio = TfidfVectorizer(max_features=1000, stop_words='english')
        X_train_prio_vec = vec_prio.fit_transform(X_train)
        X_test_prio_vec = vec_prio.transform(X_test)
        
        model_prio = MultinomialNB()
        model_prio.fit(X_train_prio_vec, y_train_prio)
        
        preds_prio = model_prio.predict(X_test_prio_vec)
        
        prio_acc = accuracy_score(y_test_prio, preds_prio)
        prio_precision = precision_score(y_test_prio, preds_prio, average='weighted', zero_division=0)
        prio_recall = recall_score(y_test_prio, preds_prio, average='weighted', zero_division=0)
        prio_f1 = f1_score(y_test_prio, preds_prio, average='weighted', zero_division=0)
        prio_cm = confusion_matrix(y_test_prio, preds_prio)
        
        metadata["models"]["complaint_priority"].update({
            "accuracy": round(prio_acc, 4),
            "precision": round(prio_precision, 4),
            "recall": round(prio_recall, 4),
            "f1_score": round(prio_f1, 4),
            "confusion_matrix": clean_cm(prio_cm),
            "classes": model_prio.classes_.tolist()
        })
        
        # Save pickles
        with open(os.path.join(MODELS_DIR, 'complaint_category_model.pkl'), 'wb') as f:
            pickle.dump(model_cat, f)
        with open(os.path.join(MODELS_DIR, 'complaint_category_vectorizer.pkl'), 'wb') as f:
            pickle.dump(vec_cat, f)
            
        with open(os.path.join(MODELS_DIR, 'complaint_priority_model.pkl'), 'wb') as f:
            pickle.dump(model_prio, f)
        with open(os.path.join(MODELS_DIR, 'complaint_priority_vectorizer.pkl'), 'wb') as f:
            pickle.dump(vec_prio, f)
            
        print("[OK] Complaints models saved.")

    # MODEL C: Tax Defaulter Prediction (Random Forest)
    if os.path.exists(TAX_FILE):
        print("Training Tax Defaulter Model...")
        df = pd.read_excel(TAX_FILE)
        df = df.dropna(subset=['property_type', 'tax_amount', 'history_paid_ratio', 'late_payments', 'is_defaulter'])
        
        X = df[['property_type', 'tax_amount', 'history_paid_ratio', 'late_payments']]
        y = df['is_defaulter']
        
        metadata["models"]["tax_defaulter"] = {"dataset_size": len(df)}
        
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        
        model_tax = DecisionTreeClassifier(max_depth=5, random_state=42)
        model_tax.fit(X_train, y_train)
        
        preds_tax = model_tax.predict(X_test)
        
        tax_acc = accuracy_score(y_test, preds_tax)
        tax_precision = precision_score(y_test, preds_tax, average='weighted', zero_division=0)
        tax_recall = recall_score(y_test, preds_tax, average='weighted', zero_division=0)
        tax_f1 = f1_score(y_test, preds_tax, average='weighted', zero_division=0)
        tax_cm = confusion_matrix(y_test, preds_tax)
        
        metadata["models"]["tax_defaulter"].update({
            "accuracy": round(tax_acc, 4),
            "precision": round(tax_precision, 4),
            "recall": round(tax_recall, 4),
            "f1_score": round(tax_f1, 4),
            "confusion_matrix": clean_cm(tax_cm),
            "classes": ["Non-Defaulter", "Defaulter"]
        })
        
        with open(os.path.join(MODELS_DIR, 'tax_defaulter_model.pkl'), 'wb') as f:
            pickle.dump(model_tax, f)
            
        print("[OK] Tax model saved.")

    # MODEL D: Scheme Recommender (Decision Tree)
    if os.path.exists(SCHEMES_FILE):
        print("Training Schemes Model...")
        df = pd.read_excel(SCHEMES_FILE)
        df = df.dropna(subset=['age', 'gender', 'occupation', 'income', 'land_size', 'is_farmer', 'is_student', 'disability', 'recommended_scheme'])
        
        # Process categoricals
        # Age, income, land_size, is_farmer, is_student, disability are numeric/flags
        # gender, occupation must be encoded
        X_df = df[['age', 'gender', 'occupation', 'income', 'land_size', 'is_farmer', 'is_student', 'disability']].copy()
        
        # Label encode Gender and Occupation using manual mappings for reproducibility
        gender_map = {"Male": 0, "Female": 1, "Other": 2}
        occ_map = {"Agriculture": 0, "Laborer": 1, "Business": 2, "Unemployed": 3, "Student": 4, "Other": 5}
        
        X_df['gender'] = X_df['gender'].map(lambda x: gender_map.get(x, 2))
        X_df['occupation'] = X_df['occupation'].map(lambda x: occ_map.get(x, 5))
        
        X = X_df.values
        y = df['recommended_scheme']
        
        metadata["models"]["scheme_recommender"] = {"dataset_size": len(df)}
        
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        
        model_scheme = DecisionTreeClassifier(max_depth=6, random_state=42)
        model_scheme.fit(X_train, y_train)
        
        preds_scheme = model_scheme.predict(X_test)
        
        scheme_acc = accuracy_score(y_test, preds_scheme)
        scheme_precision = precision_score(y_test, preds_scheme, average='weighted', zero_division=0)
        scheme_recall = recall_score(y_test, preds_scheme, average='weighted', zero_division=0)
        scheme_f1 = f1_score(y_test, preds_scheme, average='weighted', zero_division=0)
        scheme_cm = confusion_matrix(y_test, preds_scheme)
        
        metadata["models"]["scheme_recommender"].update({
            "accuracy": round(scheme_acc, 4),
            "precision": round(scheme_precision, 4),
            "recall": round(scheme_recall, 4),
            "f1_score": round(scheme_f1, 4),
            "confusion_matrix": clean_cm(scheme_cm),
            "classes": model_scheme.classes_.tolist()
        })
        
        # Save model and mappings
        with open(os.path.join(MODELS_DIR, 'scheme_model.pkl'), 'wb') as f:
            pickle.dump(model_scheme, f)
        with open(os.path.join(MODELS_DIR, 'scheme_mappings.pkl'), 'wb') as f:
            pickle.dump({"gender_map": gender_map, "occ_map": occ_map}, f)
            
        print("[OK] Schemes model saved.")

    # Write metadata
    with open(METADATA_FILE, 'w') as f:
        json.dump(metadata, f, indent=2)
        
    print(f"[OK] All models trained successfully! Metadata written to {METADATA_FILE}")
    return metadata

if __name__ == "__main__":
    # Generate seed data if files are missing
    generate_seed_datasets()
    
    # If JSON payload is passed through stdin (e.g. during admin export retraining)
    if len(sys.argv) > 1 and sys.argv[1] == "--retrain":
        print("Received retraining request with payload...")
        payload = ""
        for line in sys.stdin:
            payload += line
        if payload.strip():
            merge_database_data(payload)
            
    # Train
    train_models()
