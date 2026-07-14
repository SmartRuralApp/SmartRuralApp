import os
import sys
import json
import base64
import urllib.request
import urllib.error
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Timing and Contact Info
TIMINGS_EN = "The Gram Panchayat office is open Monday to Friday, from 9:00 AM to 5:00 PM. Closed on weekends and public holidays."
TIMINGS_KN = "ಗ್ರಾಮ ಪಂಚಾಯತ್ ಕಚೇರಿಯು ಸೋಮವಾರದಿಂದ ಶುಕ್ರವಾರದವರೆಗೆ ಬೆಳಿಗ್ಗೆ 9:00 ರಿಂದ ಸಂಜೆ 5:00 ರವರೆಗೆ ತೆರೆದಿರುತ್ತದೆ. ವಾರಾಂತ್ಯ ಮತ್ತು ಸಾರ್ವಜನಿಕ ರಜಾದಿನಗಳಲ್ಲಿ ಮುಚ್ಚಿರುತ್ತದೆ."

CONTACT_EN = "Email: contact@smartpanchayat.gov.in | Phone: +91 80 2843 1234 | Location: Panchayat Office, Main Road."
CONTACT_KN = "ಇಮೇಲ್: contact@smartpanchayat.gov.in | ಫೋನ್: +91 80 2843 1234 | ಸ್ಥಳ: ಪಂಚಾಯತ್ ಕಚೇರಿ, ಮುಖ್ಯ ರಸ್ತೆ."

# ----------------- OpenAI API Handler -----------------
def ask_openai(query, context, history, api_key):
    messages = []
    
    # System prompt
    system_prompt = (
        "You are GramMitra AI, a helpful, intelligent assistant for the Smart Gram Panchayat portal.\n"
        "Your goal is to answer queries related to Gram Panchayat services, property tax, complaints, government schemes, timings, contact details, certificates, application procedures, property information, citizen portal help, and general Gram Panchayat information.\n"
        "Provide the most relevant answer using the project database, local knowledge base, or fallback logic.\n"
        "For queries outside the project's scope, politely inform the user and guide them to the appropriate Panchayat office or available services instead of generating incorrect information.\n"
        "Negative Constraint: You MUST NEVER reply with 'I don't know', 'I cannot answer', or 'This information is unavailable' for normal Gram Panchayat queries. You must always formulate the best possible answer using the provided database context or general Panchayat knowledge.\n"
        "Always respond politely, clearly, and concisely. Use markdown where helpful.\n"
        "You MUST support both English and Kannada depending on the language used by the user.\n\n"
        "Here is live database context from the portal:\n"
    )
    
    if 'services' in context and len(context['services']) > 0:
        system_prompt += "- Active Services: " + ", ".join([f"{s['title']}: {s.get('description', '')}" for s in context['services']]) + "\n"
    if 'schemes' in context and len(context['schemes']) > 0:
        system_prompt += "- Government Schemes: " + "; ".join([f"{s['title']} (Criteria: {s.get('target_criteria', s.get('eligibility_criteria', ''))}, Documents: {s.get('required_documents', '')})" for s in context['schemes']]) + "\n"
    if 'announcements' in context and len(context['announcements']) > 0:
        system_prompt += "- Announcements: " + "; ".join([f"{a['title']}: {a['message']}" for a in context['announcements']]) + "\n"
    
    if 'property' in context and context['property']:
        p = context['property']
        system_prompt += f"- Logged-in Property: ID: {p.get('property_id')}, Owner: {p.get('owner_name')}, Address: {p.get('address')}, Type: {p.get('property_type')}\n"
    if 'tax_info' in context and context['tax_info']:
        t = context['tax_info']
        system_prompt += f"- Unpaid Tax Record: ID: {t.get('id')}, Year: {t.get('year')}, Tax Due: ₹{t.get('tax_amount')}, Status: {t.get('status')}, Due Date: {t.get('due_date')}, Predicted Default Risk: {t.get('predicted_status')}\n"
    if 'tax_records' in context and len(context['tax_records']) > 0:
        system_prompt += "- All Tax Records: " + ", ".join([f"Year {t['year']}: ₹{t['tax_amount']} ({t['status']})" for t in context['tax_records']]) + "\n"
    if 'complaints' in context and len(context['complaints']) > 0:
        system_prompt += "- Citizen Complaints: " + "; ".join([f"ID #{c['id']} {c['category']}: '{c['description']}' - Status: {c['status']}, Remarks: {c.get('admin_remarks', 'None')}" for c in context['complaints']]) + "\n"
    if 'notifications' in context and len(context['notifications']) > 0:
        system_prompt += "- Citizen Notifications: " + "; ".join([f"[{n['type']}] {n['title']}: {n['message']}" for n in context['notifications']]) + "\n"

    messages.append({"role": "system", "content": system_prompt})
    
    # Add conversation history
    for msg in history:
        messages.append({"role": msg['role'], "content": msg['content']})
        
    # Prevent duplicate user query appending
    if len(messages) == 1 or messages[-1]['content'] != query:
        messages.append({"role": "user", "content": query})
        
    payload = {
        "model": "gpt-4o-mini",
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 500
    }
    
    url = "https://api.openai.com/v1/chat/completions"
    req_data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        url,
        data=req_data,
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {api_key}'
        }
    )
    
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            text = res_data['choices'][0]['message']['content']
            return text.strip()
    except Exception as e:
        sys.stderr.write(f"OpenAI API Error: {str(e)}\n")
        return None

# ----------------- Local Rule-Based NLP Engine (Offline Fallback) -----------------
def local_nlp(query, context, history):
    query_lower = query.lower()
    
    # 1. Detect language (simple check for Kannada character range)
    is_kannada = any(0x0C80 <= ord(c) <= 0x0CFF for c in query)
    
    # 2. Extract last topic from chat history to resolve follow-ups
    last_topic = None
    if history:
        for msg in reversed(history):
            if msg['role'] == 'user':
                text = msg['content'].lower()
                if any(k in text for k in ["tax", "due", "pay", "amount", "defaulter", "payment", "ತೆರಿಗೆ", "ಬಾಕಿ", "ಪಾವತಿ"]):
                    last_topic = "tax"
                    break
                elif any(k in text for k in ["scheme", "welfare", "subsidy", "pension", "farmer", "ಯೋಜನೆ", "ಪಿಂಚಣಿ"]):
                    last_topic = "schemes"
                    break
                elif any(k in text for k in ["service", "certificate", "birth", "death", "marriage", "water", "connection", "licence", "license", "ಸೇವೆ", "ಪ್ರಮಾಣಪತ್ರ"]):
                    last_topic = "services"
                    break
                elif any(k in text for k in ["complaint", "file", "register", "report", "issue", "ದೂರು", "ನೋಂದಣಿ"]):
                    last_topic = "complaints"
                    break

    # Determine current topic
    current_topic = None
    if any(k in query_lower for k in ["tax", "due", "pay", "amount", "defaulter", "payment", "ತೆರಿಗೆ", "ಬಾಕಿ", "ಪಾವತಿ", "ಹಣ"]):
        current_topic = "tax"
    elif any(k in query_lower for k in ["scheme", "welfare", "subsidy", "pension", "farmer", "ಯೋಜನೆ", "ಪಿಂಚಣಿ", "ಸಹಾಯಧನ"]) or any(s['title'].lower() in query_lower for s in context.get('schemes', [])):
        current_topic = "schemes"
    elif any(k in query_lower for k in ["service", "certificate", "birth", "death", "marriage", "water", "connection", "licence", "license", "ಸೇವೆ", "ಪ್ರಮಾಣಪತ್ರ", "ಜನನ", "ಮರಣ", "ವಿವಾಹ", "ನೀರು"]) or any(s['title'].lower() in query_lower for s in context.get('services', [])):
        current_topic = "services"
    elif any(k in query_lower for k in ["complaint", "file", "register", "report", "issue", "ದೂರು", "ನೋಂದಣಿ", "ಸಲ್ಲಿಸಲು"]):
        current_topic = "complaints"
    elif any(k in query_lower for k in ["notification", "alert", "notice", "ಅಧಿಸೂಚನೆ"]):
        current_topic = "notifications"
    elif any(k in query_lower for k in ["timing", "hour", "open", "close", "schedule", "work time", "ಸಮಯ", "ಯಾವಾಗ", "ತೆರೆದಿರುತ್ತದೆ", "ಅಧಿಕೃತ ಸಮಯ"]):
        current_topic = "timings"
    elif any(k in query_lower for k in ["contact", "phone", "email", "number", "location", "address", "call", "ಸಂಪರ್ಕ", "ಫೋನ್", "ಇಮೇಲ್", "ವಿಳಾಸ"]):
        current_topic = "contact"
    elif any(k in query_lower for k in ["hello", "hi", "hey", "namaste", "good morning", "ನಮಸ್ಕಾರ", "ಹಲೋ"]):
        current_topic = "greeting"
        
    # Resolve follow-up if no current topic is explicitly mentioned, but we have a last topic
    if not current_topic and last_topic:
        follow_up_indicators = ["it", "them", "how to", "pay", "documents", "required", "status", "detail", "ಅದಕ್ಕೆ", "ಯಾವಾಗ", "ಹೇಗೆ", "ದಾಖಲೆ", "ಸ್ಥಿತಿ"]
        if any(ind in query_lower for ind in follow_up_indicators):
            current_topic = last_topic

    # Compile the response based on the detected topic
    if current_topic == "timings":
        return TIMINGS_KN if is_kannada else TIMINGS_EN
        
    elif current_topic == "contact":
        return CONTACT_KN if is_kannada else CONTACT_EN
        
    elif current_topic == "tax":
        tax_t = context.get('tax_info')
        if tax_t:
            if is_kannada:
                return (
                    f"ನಿಮ್ಮ ಬಾಕಿ ಆಸ್ತಿ ತೆರಿಗೆ ವಿವರಗಳು:\n"
                    f"• ಆಸ್ತಿ ID: {tax_t.get('property_id')}\n"
                    f"• ಮಾಲೀಕರು: {tax_t.get('owner_name')}\n"
                    f"• ಬಾಕಿ ತೆರಿಗೆ: ₹{tax_t.get('tax_amount')}\n"
                    f"• ಸ್ಥಿತಿ: {tax_t.get('status')}\n"
                    f"• ಕೊನೆಯ ದಿನಾಂಕ: {tax_t.get('due_date')}\n"
                    f"ಆನ್‌ಲೈನ್ ಪಾವತಿಗಾಗಿ 'Tax Search' ಪೋರ್ಟಲ್ ಬಳಸಿ ಅಥವಾ ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿ ಪಾವತಿಸಲು ದಯವಿಟ್ಟು ಪಂಚಾಯತ್ ಕಚೇರಿಗೆ ಭೇಟಿ ನೀಡಿ."
                )
            else:
                return (
                    f"Your outstanding property tax details:\n"
                    f"• Property ID: {tax_t.get('property_id')}\n"
                    f"• Owner: {tax_t.get('owner_name')}\n"
                    f"• Pending Tax: ₹{tax_t.get('tax_amount')}\n"
                    f"• Status: {tax_t.get('status')}\n"
                    f"• Due Date: {tax_t.get('due_date')}\n"
                    f"You can pay online via the citizen portal ('Tax Search' tab) or visit the Panchayat office for offline payments."
                )
        else:
            tax_recs = context.get('tax_records', [])
            if tax_recs:
                lines = [f"• Year {t['year']}: ₹{t['tax_amount']} - Status: {t['status']}" for t in tax_recs]
                if is_kannada:
                    return "ನಿಮ್ಮ ಆಸ್ತಿ ತೆರಿಗೆ ಇತಿಹಾಸ:\n" + "\n".join(lines) + "\nಎಲ್ಲಾ ತೆರಿಗೆ ಬಾಕಿ ಪಾವತಿಗಳನ್ನು ನಾಗರಿಕ ಪೋರ್ಟಲ್‌ನಲ್ಲಿ ಆನ್‌ಲೈನ್‌ನಲ್ಲಿ ಮಾಡಬಹುದು."
                else:
                    return "Your Property Tax history:\n" + "\n".join(lines) + "\nAll taxes can be viewed and paid online via the Citizen Portal."
            
            if is_kannada:
                return "ಆಸ್ತಿ ತೆರಿಗೆಯನ್ನು ಆಸ್ತಿಯ ಗಾತ್ರ ಮತ್ತು ಪ್ರಕಾರದ ಮೇಲೆ ನಿರ್ಧರಿಸಲಾಗುತ್ತದೆ. ನಾಗರಿಕರು ಆನ್‌ಲೈನ್‌ನಲ್ಲಿ 'Tax Search' ಮೂಲಕ ಅಥವಾ ಗ್ರಾಮ ಪಂಚಾಯತ್ ಕಚೇರಿಯಲ್ಲಿ ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿ ಪಾವತಿಸಬಹುದು."
            else:
                return "Property tax is determined based on property dimensions and category (residential/commercial). Citizens can search and pay their tax online via the 'Search & Pay Tax' section or offline at the Gram Panchayat office."

    elif current_topic == "schemes":
        schemes = context.get('schemes', [])
        target_scheme = None
        for s in schemes:
            if s['title'].lower() in query_lower:
                target_scheme = s
                break
                
        if target_scheme:
            title = target_scheme['title']
            criteria = target_scheme.get('target_criteria') or target_scheme.get('eligibility_criteria') or "N/A"
            docs = target_scheme.get('required_documents') or "N/A"
            benefits = target_scheme.get('benefits') or "Financial support/subsidy"
            process = target_scheme.get('application_process') or "Apply online on portal or submit application at Gram Panchayat."
            
            if is_kannada:
                return (
                    f"ಯೋಜನೆಯ ವಿವರಗಳು: **{title}**\n"
                    f"• ಅರ್ಹತಾ ಮಾನದಂಡಗಳು: {criteria}\n"
                    f"• ಅಗತ್ಯ ದಾಖಲೆಗಳು: {docs}\n"
                    f"• ಪ್ರಯೋಜನಗಳು: {benefits}\n"
                    f"• ಅರ್ಜಿ ಸಲ್ಲಿಸುವ ವಿಧಾನ: {process}"
                )
            else:
                return (
                    f"Scheme Details: **{title}**\n"
                    f"• Eligibility Criteria: {criteria}\n"
                    f"• Required Documents: {docs}\n"
                    f"• Benefits: {benefits}\n"
                    f"• Application Process: {process}"
                )
                
        if len(schemes) > 0:
            lines = [f"• {s['title']} (Eligibility: {s.get('target_criteria', s.get('eligibility_criteria', 'N/A'))})" for s in schemes]
            if is_kannada:
                return f"ಗ್ರಾಮ ಪಂಚಾಯತ್ ಅಡಿಯಲ್ಲಿ ಲಭ್ಯವಿರುವ ಕಲ್ಯಾಣ ಯೋಜನೆಗಳು:\n" + "\n".join(lines) + "\nಯಾವುದೇ ನಿರ್ದಿಷ್ಟ ಯೋಜನೆಯ ಅರ್ಹತೆ ಅಥವಾ ದಾಖಲೆಗಳನ್ನು ತಿಳಿಯಲು ಅದರ ಹೆಸರನ್ನು ಕೇಳಿ."
            else:
                return f"Welfare schemes available under Gram Panchayat:\n" + "\n".join(lines) + "\nTo know details of any specific scheme, ask with its name (e.g., 'eligibility for PM Kisan')."
        else:
            if is_kannada:
                return "ಲಭ್ಯವಿರುವ ಯೋಜನೆಗಳು: PM Kisan (ರೈತರಿಗೆ ಸಹಾಯಧನ), MGNREGA (ಉದ್ಯೋಗ ಖಾತರಿ), ಮತ್ತು PM Awas Yojana (ವಸತಿ ಸಹಾಯ). ಅರ್ಜಿ ಸಲ್ಲಿಸಲು ನಾಗರಿಕ ಪೋರ್ಟಲ್ ಬಳಸಿ."
            else:
                return "Active welfare schemes include PM Kisan (Farmer Subsidy), MGNREGA (Rural Employment), and PM Awas Yojana (Housing Support). Apply directly via the schemes section."

    elif current_topic == "services":
        services = context.get('services', [])
        target_service = None
        for s in services:
            if s['title'].lower() in query_lower or (s.get('description') and s['description'].lower() in query_lower):
                target_service = s
                break
                
        if target_service:
            title = target_service['title']
            desc = target_service.get('description') or "Panchayat service"
            docs = target_service.get('required_documents') or "Identity proof, Address proof, Property documents"
            fees = target_service.get('fees') or "As per Panchayat norms"
            
            if is_kannada:
                return (
                    f"ಸೇವೆಯ ವಿವರಗಳು: **{title}**\n"
                    f"• ವಿವರಣೆ: {desc}\n"
                    f"• ಅಗತ್ಯ ದಾಖಲೆಗಳು: {docs}\n"
                    f"• ಶುಲ್ಕಗಳು: {fees}\n"
                    f"ನಾಗರಿಕ ಪೋರ್ಟಲ್‌ನ 'Services' ವಿಭಾಗದಲ್ಲಿ ನೀವು ಇದಕ್ಕೆ ಅರ್ಜಿ ಸಲ್ಲಿಸಬಹುದು."
                )
            else:
                return (
                    f"Service Details: **{title}**\n"
                    f"• Description: {desc}\n"
                    f"• Required Documents: {docs}\n"
                    f"• Fees/Charges: {fees}\n"
                    f"You can apply for this directly online via the 'Services' tab in the Citizen Portal."
                )

        if len(services) > 0:
            titles = [s['title'] for s in services]
            if is_kannada:
                return f"ಗ್ರಾಮ ಪಂಚಾಯತಿಯಲ್ಲಿ ಲಭ್ಯವಿರುವ ಸಕ್ರಿಯ ಸೇವೆಗಳು:\n" + "\n".join([f"• {t}" for t in titles]) + "\nನಾಗರಿಕ ಪೋರ್ಟಲ್‌ನಲ್ಲಿ ಇವುಗಳಿಗೆ ಆನ್‌ಲೈನ್‌ನಲ್ಲಿ ಅರ್ಜಿ ಸಲ್ಲಿಸಬಹುದು."
            else:
                return f"Active services available at our Panchayat:\n" + "\n".join([f"• {t}" for t in titles]) + "\nYou can apply for these online in the 'Services' section of the portal."
        else:
            if is_kannada:
                return "ಗ್ರಾಮ ಪಂಚಾಯತಿ ಸೇವೆಗಳು: ಜನನ/ಮರಣ ಪ್ರಮಾಣಪತ್ರಗಳು, ನೀರು ಸಂಪರ್ಕ, ಮತ್ತು ಕಟ್ಟಡ ಅನುಮತಿ. ನಾಗರಿಕ ಪೋರ್ಟಲ್‌ನಲ್ಲಿ ಅರ್ಜಿ ಸಲ್ಲಿಸಿ."
            else:
                return "Panchayat services include Birth/Death Certificates, Water Connection, and Building Permissions. Apply directly via the 'Services' section of the portal."

    elif current_topic == "complaints":
        compls = context.get('complaints', [])
        if compls:
            lines = [f"• ID #{c['id']} ({c['category']}): Status is '{c['status']}', Priority: '{c['priority']}' (Remarks: {c.get('admin_remarks') or 'No remarks yet'})" for c in compls]
            if is_kannada:
                return f"ನಿಮ್ಮ ದೂರುಗಳ ಪ್ರಗತಿ:\n" + "\n".join(lines)
            else:
                return f"Your registered complaints progress:\n" + "\n".join(lines)
                
        if is_kannada:
            return "ದೂರು ಸಲ್ಲಿಸಲು: ನಾಗರಿಕ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್‌ನಲ್ಲಿ 'Register Complaint' ವಿಭಾಗಕ್ಕೆ ಹೋಗಿ, ವರ್ಗವನ್ನು ಆಯ್ಕೆ ಮಾಡಿ, ಸಮಸ್ಯೆಯನ್ನು ವಿವರಿಸಿ ಮತ್ತು ಸಲ್ಲಿಸಿ. ಗ್ರಾಮಿತ್ರ ಎಐ ಸ್ವಯಂಚಾಲಿತವಾಗಿ ವರ್ಗ ಮತ್ತು ಆದ್ಯತೆಯನ್ನು ವರ್ಗೀಕರಿಸುತ್ತದೆ."
        else:
            return "To file a complaint: Go to the Citizen Dashboard, click on 'Register Complaint', select the category, describe the issue in detail, and click submit. GramMitra AI will automatically classify the category and predict priority."

    elif current_topic == "notifications":
        notifs = context.get('notifications', [])
        if notifs:
            lines = [f"• [{n['type']}] {n['title']}: {n['message']}" for n in notifs]
            if is_kannada:
                return "ನಿಮ್ಮ ಇತ್ತೀಚಿನ ಅಧಿಸೂಚನೆಗಳು:\n" + "\n".join(lines)
            else:
                return "Your recent notifications:\n" + "\n".join(lines)
        else:
            if is_kannada:
                return "ನಿಮ್ಮ ಖಾತೆಗೆ ಯಾವುದೇ ಹೊಸ ಅಧಿಸೂಚನೆಗಳಿಲ್ಲ."
            else:
                return "No new notifications found in your account."

    elif current_topic == "greeting":
        if is_kannada:
            return "ನಮಸ್ಕಾರ! ನಾನು ಗ್ರಾಮಿತ್ರ ಎಐ, ನಿಮ್ಮ ಪಂಚಾಯತ್ ಸಹಾಯಕ. ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ? ನೀವು ತೆರಿಗೆ ಬಾಕಿ, ಸರ್ಕಾರಿ ಯೋಜನೆಗಳು, ನಾಗರಿಕ ಸೇವೆಗಳು, ಅಥವಾ ದೂರುಗಳ ಬಗ್ಗೆ ಕೇಳಬಹುದು."
        else:
            return "Hello! I am GramMitra AI, your Gram Panchayat assistant. How can I help you today? You can ask me about tax dues, government schemes, citizen services, timings, contact info, or complaints."

    # Fallback response for out of scope queries
    if is_kannada:
        return "ಕ್ಷಮಿಸಿ, ನಾನು ಗ್ರಾಮಿತ್ರ ಎಐ. ಪಂಚಾಯತ್ ಸೇವೆಗಳು, ತೆರಿಗೆಗಳು, ಕಚೇರಿ ಸಮಯ ಅಥವಾ ದೂರುಗಳಿಗೆ ಸಂಬಂಧಿಸಿದ ಪ್ರಶ್ನೆಗಳಿಗೆ ಮಾತ್ರ ನಾನು ಉತ್ತರಿಸಬಲ್ಲೆ. ಇತರ ವಿಷಯಗಳಿಗಾಗಿ ದಯವಿಟ್ಟು ಸಂಬಂಧಿತ ಇಲಾಖೆಯನ್ನು ಸಂಪರ್ಕಿಸಿ."
    else:
        return "I am GramMitra AI. I can only assist you with Gram Panchayat related questions regarding services, property tax, complaints, timings, or government schemes. For other queries, please visit the Gram Panchayat Office or contact support."

# ----------------- Main CLI Handler -----------------
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
    
    response = None
    if api_key and api_key.strip() != "" and not api_key.startswith("your_openai_"):
        response = ask_openai(query, context, history, api_key)
        
    if not response:
        response = local_nlp(query, context, history)
        
    print(response)

if __name__ == "__main__":
    main()
