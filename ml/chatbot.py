import os
import sys
import json
import base64
import urllib.request
import urllib.error
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Office details
TIMINGS_EN = "The Gram Panchayat office is open Monday to Friday, from 9:00 AM to 5:00 PM. Closed on weekends and public holidays."
TIMINGS_KN = "ಗ್ರಾಮ ಪಂಚಾಯತ್ ಕಚೇರಿಯು ಸೋಮವಾರದಿಂದ ಶುಕ್ರವಾರದವರೆಗೆ ಬೆಳಿಗ್ಗೆ 9:00 ರಿಂದ ಸಂಜೆ 5:00 ರವರೆಗೆ ತೆರೆದಿರುತ್ತದೆ. ವಾರಾಂತ್ಯ ಮತ್ತು ಸಾರ್ವಜನಿಕ ರಜಾದಿನಗಳಲ್ಲಿ ಮುಚ್ಚಿರುತ್ತದೆ."

CONTACT_EN = "Email: contact@smartpanchayat.gov.in | Phone: +91 80 2843 1234 | Location: Panchayat Office, Main Road."
CONTACT_KN = "ಇಮೇಲ್: contact@smartpanchayat.gov.in | ಫೋನ್: +91 80 2843 1234 | ಸ್ಥಳ: ಪಂಚಾಯತ್ ಕಚೇರಿ, ಮುಖ್ಯ ರಸ್ತೆ."

# ----------------- OpenAI API Handler -----------------
def ask_openai(query, context, history, api_key):
    system_prompt = f"""
You are GramMitra AI, an intelligent AI assistant for the Smart Gram Panchayat Portal.

Your personality:
- Friendly
- Professional
- Helpful
- Conversational like ChatGPT
- Never sound robotic.

Rules:

1. Always answer naturally.

2. Use the database context below whenever possible.

3. If the database contains the requested information,
always use it.

4. If the answer is NOT present in the database,
use your knowledge about:

• Gram Panchayat
• Property Tax
• Water Connection
• Birth Certificate
• Death Certificate
• Marriage Certificate
• Building Permission
• Trade License
• Government Schemes
• PM Kisan
• PMAY
• MGNREGA
• Complaints
• Citizen Services
• Karnataka Panchayat procedures
• Digital Governance

5. Never create fake citizen records.

6. If the user asks:

"My tax"

"My complaints"

"My notifications"

"My property"

"My application"

only answer using the provided database.

7. If the user asks something unrelated like

"Who won IPL?"

"What is Python?"

"What is AI?"

politely explain that you are a Gram Panchayat assistant.

8. Answer follow-up questions using previous conversation.

9. Reply in Kannada if the user's message is in Kannada.
Reply in English otherwise.

10. Format answers using bullet points whenever helpful.

Database Context:

{json.dumps(context, indent=2)}

"""

    messages = [
        {
            "role": "system",
            "content": system_prompt
        }
    ]

    # Add previous chat history
    for msg in history[-15:]:
        messages.append({
            "role": msg["role"],
            "content": msg["content"]
        })

    messages.append({
        "role": "user",
        "content": query
    })

    payload = {
        "model": "gpt-4o-mini",
        "messages": messages,
        "temperature": 0.5,
        "top_p": 0.9,
        "max_tokens": 700,
        "presence_penalty": 0.3,
        "frequency_penalty": 0.2
    }

    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        }
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode("utf-8"))
            return result["choices"][0]["message"]["content"]

    except urllib.error.HTTPError as e:
        sys.stderr.write(f"HTTPError: {e.read().decode()}\n")
        return None

    except Exception as e:
        sys.stderr.write(f"Error: {e}\n")
        return None

# ----------------- Local Rule-Based NLP Engine (Offline Fallback) -----------------
def detect_intent(query):
    query_lower = query.lower().strip()
    
    # NLP keyword patterns
    intents = {
        "greeting": [
            "hello", "hi", "hey", "namaste", "good morning", "good afternoon", "greetings", "helper", "assistant",
            "ಹಲೋ", "ನಮಸ್ಕಾರ", "ಶುಭೋದಯ"
        ],
        "timings": [
            "timing", "hour", "open", "close", "schedule", "work time", "working hour", "when open", "time table", "office hour",
            "ಸಮಯ", "ಯಾವಾಗ", "ತೆರೆದಿರುತ್ತದೆ", "ಅಧಿಕೃತ ಸಮಯ"
        ],
        "contact": [
            "contact", "phone", "email", "number", "location", "address", "call", "where is", "office map", "telephone",
            "ಸಂಪರ್ಕ", "ಫೋನ್", "ಇಮೇಲ್", "ವಿಳಾಸ", "ಸ್ಥಳ"
        ],
        "tax": [
            "tax", "property tax", "due", "pay", "outstanding", "pending tax", "check tax", "tax status", "tax record", "bill",
            "ತೆರಿಗೆ", "ಬಾಕಿ", "ಪಾವತಿ", "ಹಣ", "ಆಸ್ತಿ ತೆರಿಗೆ"
        ],
        "complaint_register": [
            "file complaint", "lodge complaint", "register complaint", "submit complaint", "report issue", "file grievance", "new complaint", "how to complain",
            "ದೂರು ಸಲ್ಲಿಸಲು", "ಹೊಸ ದೂರು", "ನೋಂದಣಿ ದೂರು"
        ],
        "complaint_status": [
            "complaint status", "track complaint", "my complaint", "complaint history", "complaint progress", "grievance status", "complaint list",
            "ದೂರು ಸ್ಥಿತಿ", "ನನ್ನ ದೂರುಗಳು", "ದೂರುಗಳ ಪ್ರಗತಿ"
        ],
        "schemes": [
            "scheme", "welfare", "eligible scheme", "my scheme", "subsidy", "pension", "pm kisan", "awas yojana", "mgnrega", "scholarship",
            "ಯೋಜನೆ", "ಪಿಂಚಣಿ", "ಸಹಾಯಧನ", "ಕಲ್ಯಾಣ ಯೋಜನೆ"
        ],
        "birth_certificate": [
            "birth certificate", "birth cert", "new born register", "child registration",
            "ಜನನ ಪ್ರಮಾಣಪತ್ರ", "ಜನನ ದಾಖಲೆ"
        ],
        "death_certificate": [
            "death certificate", "death cert", "deceased certificate",
            "ಮರಣ ಪ್ರಮಾಣಪತ್ರ"
        ],
        "income_certificate": [
            "income certificate", "income cert", "salary certificate",
            "ಆದಾಯ ಪ್ರಮಾಣಪತ್ರ"
        ],
        "caste_certificate": [
            "caste certificate", "caste cert", "obc certificate", "sc st certificate",
            "ಜಾತಿ ಪ್ರಮಾಣಪತ್ರ"
        ],
        "residence_certificate": [
            "residence certificate", "residence cert", "domicile", "address certificate",
            "ನಿವಾಸಿ ಪ್ರಮಾಣಪತ್ರ", "ವಾಸಸ್ಥಳ ಪ್ರಮಾಣಪತ್ರ"
        ],
        "certificates": [
            "certificate", "certificates", "documents required for cert", "apply cert",
            "ಪ್ರಮಾಣಪತ್ರ", "ಪ್ರಮಾಣಪತ್ರಗಳು"
        ],
        "registration": [
            "property registration", "citizen registration", "register property", "register citizen", "sign up", "create account",
            "ನೋಂದಣಿ", "ಖಾತೆ ತೆರೆಯಿರಿ"
        ],
        "water_supply": [
            "water supply", "water connection", "drinking water", "water tap", "water leak", "water pipe",
            "ನೀರು ಸರಬರಾಜು", "ನೀರಿನ ಸಂಪರ್ಕ", "ಕುಡಿಯುವ ನೀರು"
        ],
        "roads": [
            "road", "pothole", "tar road", "street repair", "road damage",
            "ರಸ್ತೆ", "ಗುಂಡಿ", "ರಸ್ತೆ ಹಾನಿ"
        ],
        "drainage": [
            "drainage", "sewage", "gutter", "manhole", "drain block", "sewer",
            "ಒಳಚರಂಡಿ", "ಚರಂಡಿ"
        ],
        "waste_management": [
            "waste management", "garbage", "trash", "cleanliness", "dustbin", "waste disposal",
            "ತ್ಯಾಜ್ಯ ನಿರ್ವಹಣೆ", "ಕಸ ಸಂಗ್ರಹಣೆ"
        ],
        "street_lights": [
            "street light", "lamp post", "bulb broken", "dark street", "light pole",
            "ಬೀದಿ ದೀಪ", "ಕಂಬ"
        ],
        "general_services": [
            "general services", "panchayat services", "what services", "list services",
            "ಸೇವೆಗಳು", "ಪಂಚಾಯತ್ ಸೇವೆಗಳು"
        ],
        "documents": [
            "required document", "documents needed", "what document", "file upload",
            "ದಾಖಲೆಗಳು", "ಯಾವ ದಾಖಲೆ"
        ],
        "process": [
            "application process", "how to apply", "procedure",
            "ಅರ್ಜಿ ಪ್ರಕ್ರಿಯೆ", "ಹೇಗೆ ಅರ್ಜಿ ಸಲ್ಲಿಸಬೇಕು"
        ],
        "citizen_info": [
            "profile", "my details", "citizen info", "citizen details", "my information", "about me", "my name", "my profile",
            "ನನ್ನ ಮಾಹಿತಿ", "ನನ್ನ ವಿವರ", "ನನ್ನ ಪ್ರೊಫೈಲ್"
        ]
    }
    
    scores = {}
    for intent, keywords in intents.items():
        score = 0
        for kw in keywords:
            if kw in query_lower:
                score += (len(kw.split()) * 5)
        scores[intent] = score
        
    best_intent = max(scores, key=scores.get)
    if scores[best_intent] > 0:
        return best_intent
    return "out-of-scope"

def local_nlp(query, context, history=None):
    is_kannada = any(0x0C80 <= ord(c) <= 0x0CFF for c in query)
    
    # Resolve last topic from history to handle follow-up queries
    last_topic = None
    if history:
        for msg in reversed(history):
            if msg.get('role') == 'user':
                text = msg.get('content', '').lower()
                if any(k in text for k in ["tax", "due", "pay", "amount", "defaulter", "payment", "ತೆರಿಗೆ", "ಬಾಕಿ", "ಪಾವತಿ"]):
                    last_topic = "tax"
                    break
                elif any(k in text for k in ["scheme", "welfare", "subsidy", "pension", "farmer", "ಯೋಜನೆ", "ಪಿಂಚಣಿ"]):
                    last_topic = "schemes"
                    break
                elif any(k in text for k in ["service", "certificate", "birth", "death", "marriage", "water", "connection", "licence", "license", "ಸೇವೆ", "ಪ್ರಮಾಣಪತ್ರ"]):
                    last_topic = "certificates"
                    break
                elif any(k in text for k in ["complaint", "file", "register", "report", "issue", "ದೂರು", "ನೋಂದಣಿ"]):
                    last_topic = "complaints"
                    break
                    
    intent = detect_intent(query)
    
    # Follow-up topic override
    if intent == "out-of-scope" and last_topic:
        follow_up_indicators = ["it", "them", "how to", "pay", "documents", "required", "status", "detail", "ಅದಕ್ಕೆ", "ಯಾವಾಗ", "ಹೇಗೆ", "ದಾಖಲೆ", "ಸ್ಥಿತಿ"]
        if any(ind in query.lower() for ind in follow_up_indicators):
            if last_topic == "tax":
                intent = "tax"
            elif last_topic == "schemes":
                intent = "schemes"
            elif last_topic == "certificates":
                intent = "certificates"
            elif last_topic == "complaints":
                intent = "complaint_status"

    # 1. TIMINGS INTENT
    if intent == "timings":
        return TIMINGS_KN if is_kannada else TIMINGS_EN
        
    # 2. CONTACT INTENT
    elif intent == "contact":
        return CONTACT_KN if is_kannada else CONTACT_EN
        
    # 3. PROPERTY TAX INTENT
    elif intent == "tax":
        tax_info = context.get('tax_info')
        tax_records = context.get('tax_records', [])
        
        if tax_info:
            if is_kannada:
                return (
                    f"ನಿಮ್ಮ ಬಾಕಿ ಆಸ್ತಿ ತೆರಿಗೆ ವಿವರಗಳು:\n"
                    f"• ಆಸ್ತಿ ID: {tax_info.get('property_id')}\n"
                    f"• ಮಾಲೀಕರು: {tax_info.get('owner_name')}\n"
                    f"• ಬಾಕಿ ತೆರಿಗೆ: ₹{tax_info.get('tax_amount')}\n"
                    f"• ಸ್ಥಿತಿ: {tax_info.get('status')}\n"
                    f"• ಕೊನೆಯ ದಿನಾಂಕ: {tax_info.get('due_date')}\n"
                    f"ಆನ್‌ಲೈನ್ ಪಾವತಿಗಾಗಿ 'Tax Search' ಪೋರ್ಟಲ್ ಬಳಸಿ ಅಥವಾ ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿ ಪಾವತಿಸಲು ಪಂಚಾಯತ್ ಕಚೇರಿಗೆ ಭೇಟಿ ನೀಡಿ."
                )
            else:
                return (
                    f"Your outstanding property tax details:\n"
                    f"• Property ID: {tax_info.get('property_id')}\n"
                    f"• Owner: {tax_info.get('owner_name')}\n"
                    f"• Pending Tax: ₹{tax_info.get('tax_amount')}\n"
                    f"• Status: {tax_info.get('status')}\n"
                    f"• Due Date: {tax_info.get('due_date')}\n"
                    f"You can pay online via the citizen portal ('Tax Search' tab) or visit the Panchayat office for offline payments."
                )
        elif len(tax_records) > 0:
            lines = [f"• Year {t['year']}: ₹{t['tax_amount']} - Status: {t['status']}" for t in tax_records]
            if is_kannada:
                return "ನಿಮ್ಮ ಆಸ್ತಿ ತೆರಿಗೆ ಇತಿಹಾಸ:\n" + "\n".join(lines) + "\nಎಲ್ಲಾ ತೆರಿಗೆ ಬಾಕಿ ಪಾವತಿಗಳನ್ನು ನಾಗರಿಕ ಪೋರ್ಟಲ್‌ನಲ್ಲಿ ಆನ್‌ಲೈನ್‌ನಲ್ಲಿ ಮಾಡಬಹುದು."
            else:
                return "Your Property Tax history:\n" + "\n".join(lines) + "\nAll taxes can be viewed and paid online via the Citizen Portal."
        else:
            if is_kannada:
                return "ಆಸ್ತಿ ತೆರಿಗೆಯನ್ನು ಆಸ್ತಿಯ ಗಾತ್ರ ಮತ್ತು ಪ್ರಕಾರದ ಮೇಲೆ ನಿರ್ಧರಿಸಲಾಗುತ್ತದೆ. ನಾಗರಿಕರು ಆನ್‌ಲೈನ್‌ನಲ್ಲಿ 'Tax Search' ಮೂಲಕ ಅಥವಾ ಗ್ರಾಮ ಪಂಚಾಯತ್ ಕಚೇರಿಯಲ್ಲಿ ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿ ಪಾವತಿಸಬಹುದು."
            else:
                return "Property tax is determined based on property dimensions and category. Citizens can search and pay their tax online via the 'Search & Pay Tax' section or offline at the Gram Panchayat office."
                
    # 4. COMPLAINT REGISTRATION INTENT
    elif intent == "complaint_register":
        if is_kannada:
            return "ದೂರು ಸಲ್ಲಿಸಲು: ನಾಗರಿಕ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್‌ನಲ್ಲಿ 'Register Complaint' ವಿಭಾಗಕ್ಕೆ ಹೋಗಿ, ವರ್ಗವನ್ನು ಆಯ್ಕೆ ಮಾಡಿ, ಸಮಸ್ಯೆಯನ್ನು ವಿವರಿಸಿ ಮತ್ತು ಸಲ್ಲಿಸಿ. ಗ್ರಾಮಿತ್ರ ಎಐ ಸ್ವಯಂಚಾಲಿತವಾಗಿ ವರ್ಗ ಮತ್ತು ಆದ್ಯತೆಯನ್ನು ವರ್ಗೀಕರಿಸುತ್ತದೆ."
        else:
            return "To file a complaint: Go to the Citizen Dashboard, click on 'Register Complaint', select the category, describe the issue in detail, and click submit. Priority is predicted dynamically."
            
    # 5. COMPLAINT STATUS INTENT
    elif intent == "complaint_status":
        compls = context.get('complaints', [])
        if compls:
            lines = [f"• ID #{c['id']} ({c['category']}): Status is '{c['status']}', Priority: '{c['priority']}' (Remarks: {c.get('admin_remarks') or 'No remarks yet'})" for c in compls]
            if is_kannada:
                return f"ನಿಮ್ಮ ದೂರುಗಳ ಪ್ರಗತಿ:\n" + "\n".join(lines)
            else:
                return f"Your registered complaints progress:\n" + "\n".join(lines)
        else:
            if is_kannada:
                return "ನಿಮ್ಮ ಖಾತೆಯಲ್ಲಿ ಯಾವುದೇ ನೋಂದಾಯಿತ ದೂರುಗಳು ಕಂಡುಬಂದಿಲ್ಲ."
            else:
                return "No registered complaints found in your account."
                
    # 6. WELFARE SCHEMES INTENT
    elif intent == "schemes":
        user = context.get('user')
        schemes = context.get('schemes', [])
        
        # Check if the query is asking about a specific scheme
        target_scheme = None
        for s in schemes:
            if s['title'].lower() in query.lower():
                target_scheme = s
                break
                
        if target_scheme:
            title = target_scheme['title']
            criteria = target_scheme.get('target_criteria') or target_scheme.get('eligibility_criteria') or "N/A"
            docs = target_scheme.get('required_documents') or "N/A"
            benefits = target_scheme.get('benefits') or "Financial support/subsidy"
            if is_kannada:
                return f"ಯೋಜನೆಯ ವಿವರಗಳು: **{title}**\n• ಅರ್ಹತಾ ಮಾನದಂಡಗಳು: {criteria}\n• ಅಗತ್ಯ ದಾಖಲೆಗಳು: {docs}\n• ಪ್ರಯೋಜನಗಳು: {benefits}"
            else:
                return f"Scheme Details: **{title}**\n• Eligibility Criteria: {criteria}\n• Required Documents: {docs}\n• Benefits: {benefits}"
                
        if user and user.get('matching_scheme') and user.get('matching_scheme') != "No Matching Scheme":
            scheme = user.get('matching_scheme')
            conf = float(user.get('matching_confidence') or 0.0)
            if is_kannada:
                return f"ನಿಮ್ಮ ಪ್ರೊಫೈಲ್ ಪ್ರಕಾರ, ನಿಮ್ಮ ಅರ್ಹತಾ ಕಲ್ಯಾಣ ಯೋಜನೆ: **{scheme}** (Confidence: {conf*100:.0f}%). ನಾಗರಿಕ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್‌ನ ಯೋಜನೆಗಳ ವಿಭಾಗದಲ್ಲಿ ನೀವು ಅರ್ಜಿ ಸಲ್ಲಿಸಬಹುದು."
            else:
                return f"Based on your profile, your eligible scheme is: **{scheme}** (Confidence: {conf*100:.0f}%). You can apply via the Welfare Schemes section."
        else:
            if len(schemes) > 0:
                lines = [f"• {s['title']} (Eligibility: {s.get('target_criteria', 'N/A')})" for s in schemes]
                if is_kannada:
                    return "ಲಭ್ಯವಿರುವ ಕಲ್ಯಾಣ ಯೋಜನೆಗಳು:\n" + "\n".join(lines)
                else:
                    return "Welfare schemes available under Gram Panchayat:\n" + "\n".join(lines)
            if is_kannada:
                return "ನಿಮ್ಮ ಪ್ರಸ್ತುತ ವಿವರಕ್ಕೆ ಯಾವುದೇ ಸರ್ಕಾರಿ ಕಲ್ಯಾಣ ಯೋಜನೆಗಳು ಹೊಂದಿಕೆಯಾಗುತ್ತಿಲ್ಲ."
            else:
                return "No Government Welfare Scheme matches your current profile."
                
    # 7. CERTIFICATES INTENT
    elif intent == "birth_certificate":
        if is_kannada:
            return "ಜನನ ಪ್ರಮಾಣಪತ್ರ ಪ್ರಕ್ರಿಯೆ:\n- ಅಗತ್ಯ ದಾಖಲೆಗಳು: ಆಸ್ಪತ್ರೆಯ ವರದಿ, ಪೋಷಕರ ಆಧಾರ್ ಕಾರ್ಧ್, ಮತ್ತು ವಿಳಾಸದ ಪುರಾವೆ.\n- ಅರ್ಜಿ: 'Services' ಟ್ಯಾಬ್ ಅಡಿಯಲ್ಲಿ ಆನ್‌ಲೈನ್‌ನಲ್ಲಿ ಅರ್ಜಿ ಸಲ್ಲಿಸಿ. 21 ದಿನಗಳಲ್ಲಿ ಉಚಿತವಾಗಿ ಸಿಗುತ್ತದೆ."
        else:
            return "Birth Certificate process:\n- Documents required: Hospital discharge summary / birth report, parents' Aadhaar card, and address proof.\n- Application: Apply online under 'Services' tab or submit offline.\n- Fees: Free of charge if registered within 21 days."
            
    elif intent == "death_certificate":
        if is_kannada:
            return "ಮರಣ ಪ್ರಮಾಣಪತ್ರ ಪ್ರಕ್ರಿಯೆ:\n- ಅಗತ್ಯ ದಾಖಲೆಗಳು: ಆಸ್ಪತ್ರೆಯ ಮರಣ ವರದಿ, ಮೃತರ ಆಧಾರ್ ಕಾರ್ಡ್, ಅರ್ಜಿದಾರರ ಐಡಿ.\n- ಅರ್ಜಿ: 'Services' ಟ್ಯಾಬ್ ಅಡಿಯಲ್ಲಿ ಆನ್‌ಲೈನ್‌ನಲ್ಲಿ ಅರ್ಜಿ ಸಲ್ಲಿಸಿ."
        else:
            return "Death Certificate process:\n- Documents required: Hospital death report / cremation report, deceased person's Aadhaar, and applicant's ID.\n- Application: Apply online under 'Services' tab or submit offline."
            
    elif intent == "income_certificate":
        if is_kannada:
            return "ಆದಾಯ ಪ್ರಮಾಣಪತ್ರ ಪ್ರಕ್ರಿಯೆ:\n- ಅಗತ್ಯ ದಾಖಲೆಗಳು: ವೇತನ ಪತ್ರ / ಕೃಷಿ ಆದಾಯ ಸ್ವಯಂ ಘೋಷಣೆ, ಭೂ ದಾಖಲೆಗಳು (RTC), ಆಧಾರ್ ಕಾರ್ಡ್.\n- ಅರ್ಜಿ: 'Services' ಟ್ಯಾಬ್ ಅಡಿಯಲ್ಲಿ ಆನ್‌ಲೈನ್‌ನಲ್ಲಿ ಅರ್ಜಿ ಸಲ್ಲಿಸಿ."
        else:
            return "Income Certificate process:\n- Documents required: Salary slips / agricultural income self-declaration, land records (RTC), and Aadhaar card.\n- Application: Apply online under 'Services' tab or at the Panchayat office."
            
    elif intent == "caste_certificate":
        if is_kannada:
            return "ಜಾತಿ ಪ್ರಮಾಣಪತ್ರ ಪ್ರಕ್ರಿಯೆ:\n- ಅಗತ್ಯ ದಾಖಲೆಗಳು: ತಂದೆಯ ಜಾತಿ ಪುರಾವೆ, ಶಾಲಾ ಪ್ರಮಾಣಪತ್ರ, ಆದಾಯ ಪ್ರಮಾಣಪತ್ರ, ಮತ್ತು ಆಧಾರ್ ಕಾರ್ಡ್.\n- ಅರ್ಜಿ: 'Services' ಟ್ಯಾಬ್ ಅಡಿಯಲ್ಲಿ ಆನ್‌ಲೈನ್‌ನಲ್ಲಿ ಅರ್ಜಿ ಸಲ್ಲಿಸಿ."
        else:
            return "Caste Certificate process:\n- Documents required: Father's caste proof / school certificate, family income certificate, and Aadhaar card.\n- Application: Apply online under 'Services' tab or at the Panchayat office."
            
    elif intent == "residence_certificate":
        if is_kannada:
            return "ನಿವಾಸಿ ಪ್ರಮಾಣಪತ್ರ ಪ್ರಕ್ರಿಯೆ:\n- ಅಗತ್ಯ ದಾಖಲೆಗಳು: ವಿಳಾಸದ ಪುರಾವೆ (ಆಧಾರ್/ಮತದಾರರ ಐಡಿ), ಸ್ಥಳೀಯ ಪರಿಶೀಲನಾ ವರದಿ, ಮತ್ತು ಫೋಟೋ.\n- ಅರ್ಜಿ: 'Services' ಟ್ಯಾಬ್ ಅಡಿಯಲ್ಲಿ ಆನ್‌ಲೈನ್‌ನಲ್ಲಿ ಅರ್ಜಿ ಸಲ್ಲಿಸಿ."
        else:
            return "Residence Certificate process:\n- Documents required: Address proof (Aadhaar/Voter ID/Ration Card), local verification report, and passport photo.\n- Application: Apply online under 'Services' tab or at the Panchayat office."
            
    elif intent == "certificates":
        if is_kannada:
            return "ನಾವು ಜನನ, ಮರಣ, ಆದಾಯ, ಜಾತಿ, ಮತ್ತು ನಿವಾಸಿ ಪ್ರಮಾಣಪತ್ರಗಳನ್ನು ನೀಡುತ್ತೇವೆ. ನೀವು ನಾಗರಿಕ ಪೋರ್ಟಲ್‌ನ 'Services' ಟ್ಯಾಬ್ ಅಡಿಯಲ್ಲಿ ಇವುಗಳಿಗೆ ಅರ್ಜಿ ಸಲ್ಲಿಸಬಹುದು."
        else:
            return "We issue Birth, Death, Income, Caste, and Residence certificates. You can apply for all of them under the 'Services' tab of the Citizen Portal."
            
    # 8. SERVICES & GENERAL
    elif intent == "water_supply":
        if is_kannada:
            return "ನೀರು ಸರಬರಾಜು ಸೇವೆಗಳು:\n- ಹೊಸ ಸಂಪರ್ಕಕ್ಕಾಗಿ: 'Services' ಟ್ಯಾಬ್ ಅಡಿಯಲ್ಲಿ ಆಸ್ತಿ ತೆರಿಗೆ ರಶೀದಿಯೊಂದಿಗೆ ಅರ್ಜಿ ಸಲ್ಲಿಸಿ.\n- ಸೋರಿಕೆ ಅಥವಾ ಪೈಪ್‌ಲೈನ್ ಒಡೆದರೆ ದೂರು ನೋಂದಾಯಿಸಿ."
        else:
            return "Water Supply Services:\n- For new connections: Submit application under 'Services' tab with property tax receipt and identity proof.\n- Report leakages, pipeline bursts, or water contamination using the 'Register Complaint' module."
            
    elif intent == "roads":
        if is_kannada:
            return "ರಸ್ತೆ ಸೇವೆಗಳು: ರಸ್ತೆ ತಡೆಗಳು, ಗುಂಡಿಗಳು, ಅಥವಾ ರಸ್ತೆ ಹಾನಿಗಳನ್ನು 'Register Complaint' ಮಾಡ್ಯೂಲ್ ಅಡಿಯಲ್ಲಿ ವರದಿ ಮಾಡಿ."
        else:
            return "Road Services: Report road blockages, potholes, bridge collapses, or dangerous street conditions under the 'Register Complaint' module (Road Damage category)."
            
    elif intent == "drainage":
        if is_kannada:
            return "ಒಳಚರಂಡಿ ಸೇವೆಗಳು: ಮ್ಯಾನ್‌ಹೋಲ್ ಬ್ಲಾಕ್, ಒಳಚರಂಡಿ ಉಕ್ಕಿ ಹರಿಯುವಿಕೆಯನ್ನು 'Register Complaint' ಅಡಿಯಲ್ಲಿ ವರದಿ ಮಾಡಿ."
        else:
            return "Drainage Services: The Panchayat manages public drainage systems. Report manhole blocks, sewage overflows, or clogged public gutters in the 'Register Complaint' module (Drainage category)."
            
    elif intent == "waste_management":
        if is_kannada:
            return "ತ್ಯಾಜ್ಯ ನಿರ್ವಹಣೆ: ಕಸ ಸಂಗ್ರಹಣೆ ವಾಹನಗಳು ಪ್ರತಿದಿನ ವಾರ್ಡ್‌ಗಳಿಗೆ ಭೇಟಿ ನೀಡುತ್ತವೆ. ಕಸ ಸಂಗ್ರಹಣೆ ಸಮಸ್ಯೆಗಳನ್ನು ವರದಿ ಮಾಡಿ."
        else:
            return "Waste Management: Garbage collection vehicles visit wards daily. Please use waste bins for disposal. Report garbage accumulation or illegal dumping in the 'Register Complaint' module (Sanitation category)."
            
    elif intent == "street_lights":
        if is_kannada:
            return "ಬೀದಿ ದೀಪಗಳು: ಬೀದಿ ದೀಪಗಳು ಕೆಲಸ ಮಾಡದಿದ್ದರೆ ಅಥವಾ ಕಂಬಗಳು ಹಾನಿಯಾಗಿದ್ದರೆ ದೂರು ನೋಂದಾಯಿಸಿ."
        else:
            return "Street Lights: The Panchayat installs and maintains street lamps. Report non-functioning lamps, broken poles, or dark spots using the 'Register Complaint' module (Street Light category)."
            
    elif intent == "general_services":
        if is_kannada:
            return "ಸಕ್ರಿಯ ಸೇವೆಗಳು: ಜನನ/ಮರಣ ಪ್ರಮಾಣಪತ್ರಗಳು, ನೀರು ಸಂಪರ್ಕ, ಮತ್ತು ಕಟ್ಟಡ ಅನುಮತಿ. ನಾಗರಿಕ ಪೋರ್ಟಲ್‌ನಲ್ಲಿ ಅರ್ಜಿ ಸಲ್ಲಿಸಿ."
        else:
            return "Active Panchayat services include Birth/Death Certificates, Water Connection, Building Permissions, and Property Registration. Apply directly online in the 'Services' tab."
            
    elif intent == "documents":
        if is_kannada:
            return "ಸಾಮಾನ್ಯವಾಗಿ ಆಧಾರ್ ಕಾರ್ಡ್, ವಿಳಾಸ ಪುರಾವೆ, ಆದಾಯ ಪುರಾವೆ, ಮತ್ತು ಆಸ್ತಿ ತೆರಿಗೆ ರಶೀದಿಗಳನ್ನು ಸಿದ್ಧವಾಗಿಡಿ."
        else:
            return "For general applications, keep your Aadhaar Card, Address Proof (Voter ID/Ration Card), Income Proof, and Property Tax receipts ready."
            
    elif intent == "process":
        if is_kannada:
            return "ಅರ್ಜಿ ಪ್ರಕ್ರಿಯೆ: ನಾಗರಿಕ ಪೋರ್ಟಲ್‌ಗೆ ಲಾಗಿನ್ ಮಾಡಿ, 'Services' ಗೆ ಹೋಗಿ, ವಿವರಗಳನ್ನು ತುಂಬಿ ಮತ್ತು ದಾಖಲೆಗಳನ್ನು ಅಪ್‌ಲೋಡ್ ಮಾಡಿ."
        else:
            return "Panchayat application process:\n1. Log into your Citizen Portal.\n2. Go to 'Services' and choose the certificate/service.\n3. Fill details and upload documents.\n4. Pay nominal fees if applicable.\n5. Track application status from dashboard."
            
    elif intent == "registration":
        if is_kannada:
            return "ಲಾಗಿನ್ ಪರದೆಯಲ್ಲಿ 'Register' ಕ್ಲಿಕ್ ಮಾಡುವ ಮೂಲಕ ನಾಗರಿಕ ನೋಂದಣಿ ಮಾಡಬಹುದು. ಆಸ್ತಿ ನೋಂದಣಿಗೆ ಆಸ್ತಿ ಮಾಲೀಕತ್ವದ ದಾಖಲೆಗಳು ಬೇಕಾಗುತ್ತವೆ."
        else:
            return "Citizen Registration can be done online by clicking 'Register' on the login screen. Property registration requires land ownership papers, identity verification, and tax clearance certificates."

    elif intent == "citizen_info":
        user = context.get('user')
        if user:
            is_farmer_str = "Yes" if user.get('is_farmer') else "No"
            is_student_str = "Yes" if user.get('is_student') else "No"
            disability_str = "Yes" if user.get('disability') else "No"
            
            income = user.get('income', 0)
            try:
                income_str = f"₹{float(income):,.2f}"
            except Exception:
                income_str = f"₹{income}"
                
            if is_kannada:
                return (
                    f"ನಿಮ್ಮ ಪ್ರೊಫೈಲ್ ವಿವರಗಳು:\n"
                    f"• ಹೆಸರು: {user.get('name')}\n"
                    f"• ಬಳಕೆದಾರ ಹೆಸರು: {user.get('username')}\n"
                    f"• ಫೋನ್: {user.get('phone')}\n"
                    f"• ಇಮೇಲ್: {user.get('email') or 'N/A'}\n"
                    f"• ವಯಸ್ಸು/ಲಿಂಗ: {user.get('age')} / {user.get('gender')}\n"
                    f"• ಉದ್ಯೋಗ: {user.get('occupation')}\n"
                    f"• ವಾರ್ಷಿಕ ಆದಾಯ: {income_str}\n"
                    f"• ಜಮೀನು: {user.get('land_size')} ಎಕರೆ\n"
                    f"• ರೈತರು: {'ಹೌದು' if user.get('is_farmer') else 'ಇಲ್ಲ'}\n"
                    f"• ವಿದ್ಯಾರ್ಥಿ: {'ಹೌದು' if user.get('is_student') else 'ಇಲ್ಲ'}\n"
                    f"• ವಿಕಲಚೇತನರು: {'ಹೌದು' if user.get('is_disability') or user.get('disability') else 'ಇಲ್ಲ'}"
                )
            else:
                return (
                    f"Your citizen profile details:\n"
                    f"• Name: {user.get('name')}\n"
                    f"• Username: {user.get('username')}\n"
                    f"• Phone: {user.get('phone')}\n"
                    f"• Email: {user.get('email') or 'N/A'}\n"
                    f"• Age/Gender: {user.get('age')} yrs / {user.get('gender')}\n"
                    f"• Occupation: {user.get('occupation')}\n"
                    f"• Annual Income: {income_str}\n"
                    f"• Landholdings: {user.get('land_size')} acres\n"
                    f"• Farmer Status: {is_farmer_str}\n"
                    f"• Student Status: {is_student_str}\n"
                    f"• Disability Status: {disability_str}"
                )
        else:
            if is_kannada:
                return "ನಿಮ್ಮ ವಿವರಗಳನ್ನು ಪಡೆಯಲು ದಯವಿಟ್ಟು ನಾಗರಿಕ ಪೋರ್ಟಲ್‌ಗೆ ಲಾಗಿನ್ ಮಾಡಿ."
            else:
                return "Please log into the Citizen Portal to view your profile details."

    elif intent == "greeting":
        if is_kannada:
            return "ಸ್ಮಾರ್ಟ್ ಗ್ರಾಮ ಪಂಚಾಯತ್ ಸಹಾಯಕರಿಗೆ ಸುಸ್ವಾಗತ. ನಾನು ಇಂದು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?"
        else:
            return "Welcome to Smart Gram Panchayat Assistant. How can I help you today?"
            
    # 9. OUT OF SCOPE FALLBACK
    if is_kannada:
        return "ನಾನು ಸ್ಮಾರ್ಟ್ ಗ್ರಾಮ ಪಂಚಾಯತ್ ಸಹಾಯಕ. ನಾನು ಗ್ರಾಮ ಪಂಚಾಯತ್ ಸೇವೆಗಳು ಮತ್ತು ನಾಗರಿಕ ಸಂಬಂಧಿತ ಪ್ರಶ್ನೆಗಳಿಗೆ ಮಾತ್ರ ಸಹಾಯ ಮಾಡಬಲ್ಲೆ."
    else:
        return "I am the Smart Gram Panchayat Assistant. I can assist only with Gram Panchayat services and citizen-related queries."

def main():
    query = ""
    context = {}
    history = []
    
    # Parse arguments
    config_path = None
    for i in range(1, len(sys.argv)):
        if sys.argv[i] == "--config_path" and i+1 < len(sys.argv):
            config_path = sys.argv[i+1]
        elif sys.argv[i] == "--query" and i+1 < len(sys.argv):
            query = sys.argv[i+1]
        elif sys.argv[i] == "--query_b64" and i+1 < len(sys.argv):
            try:
                query = base64.b64decode(sys.argv[i+1]).decode('utf-8')
            except Exception:
                pass
        elif sys.argv[i] == "--context" and i+1 < len(sys.argv):
            try:
                context = json.loads(sys.argv[i+1])
            except Exception:
                pass
        elif sys.argv[i] == "--context_b64" and i+1 < len(sys.argv):
            try:
                decoded = base64.b64decode(sys.argv[i+1]).decode('utf-8')
                context = json.loads(decoded)
            except Exception:
                pass
        elif sys.argv[i] == "--history" and i+1 < len(sys.argv):
            try:
                history = json.loads(sys.argv[i+1])
            except Exception:
                pass
        elif sys.argv[i] == "--history_b64" and i+1 < len(sys.argv):
            try:
                decoded = base64.b64decode(sys.argv[i+1]).decode('utf-8')
                history = json.loads(decoded)
            except Exception:
                pass
                
    if config_path and os.path.exists(config_path):
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                config_data = json.load(f)
                query = config_data.get("query", query)
                context = config_data.get("context", context)
                history = config_data.get("history", history)
        except Exception:
            pass

    api_key = os.environ.get("OPENAI_API_KEY") or context.get("openai_api_key")

    if api_key and api_key.strip() != "" and not api_key.startswith("your_openai_"):
        response = ask_openai(query, context, history, api_key)
        if response:
            print(response)
        else:
            response = local_nlp(query, context, history)
            print(response)
    else:
        response = local_nlp(query, context, history)
        print(response)

if __name__ == "__main__":
    main()
