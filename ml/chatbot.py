import os
import sys
import json
import urllib.request
import urllib.error
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Timing and Contact Info
TIMINGS_EN = "The Gram Panchayat office is open Monday to Friday, from 9:00 AM to 5:00 PM. Closed on weekends and public holidays."
TIMINGS_KN = "ಗ್ರಾಮ ಪಂಚಾಯತ್ ಕಚೇರಿಯು ಸೋಮವಾರದಿಂದ ಶುಕ್ರವಾರದವರೆಗೆ ಬೆಳಿಗ್ಗೆ 9:00 ರಿಂದ ಸಂಜೆ 5:00 ರವರೆಗೆ ತೆರೆದಿರುತ್ತದೆ. ವಾರಾಂತ್ಯ ಮತ್ತು ಸಾರ್ವಜನಿಕ ರಜಾದಿನಗಳಲ್ಲಿ ಮುಚ್ಚಿರುತ್ತದೆ."

CONTACT_EN = "Email: contact@smartpanchayat.gov.in | Phone: +91 98765 43210 | Location: Panchayat Office, Main Road."
CONTACT_KN = "ಇಮೇಲ್: contact@smartpanchayat.gov.in | ಫೋನ್: +91 98765 43210 | ಸ್ಥಳ: ಪಂಚಾಯತ್ ಕಚೇರಿ, ಮುಖ್ಯ ರಸ್ತೆ."

# ----------------- Gemini API Handler -----------------
def ask_gemini(query, context, api_key):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
    
    # Structure system prompt
    prompt = (
        "You are GramMitra AI, a helpful, intelligent assistant for the Smart Gram Panchayat portal.\n"
        "Your goal is to answer queries related ONLY to the Gram Panchayat (services, property tax, complaints, government schemes, timing, contact details, documents).\n"
        "Keep your responses polite, clear, and concise. You MUST support both English and Kannada based on the user's language.\n"
        "Crucial: If the query is unrelated to Panchayat operations or services, politely decline: 'I am GramMitra AI, and I can only help you with Gram Panchayat related enquiries.'\n\n"
        "Here is live database context from the portal:\n"
    )
    
    if 'services' in context and len(context['services']) > 0:
        prompt += "- Active Services: " + ", ".join([s['title'] for s in context['services']]) + "\n"
    if 'announcements' in context and len(context['announcements']) > 0:
        prompt += "- Announcements: " + "; ".join([f"{a['title']}: {a['message']}" for a in context['announcements']]) + "\n"
    if 'tax_info' in context and context['tax_info']:
        t = context['tax_info']
        prompt += f"- Logged-in Property Tax Status: ID: {t.get('property_id')}, Owner: {t.get('owner_name')}, Tax Due: ₹{t.get('tax_amount')}, Status: {t.get('status')}, Due Date: {t.get('due_date')}, Predicted Default Risk: {t.get('predicted_status', 'Low Risk')}\n"
    
    prompt += f"\nUser Query: {query}\nResponse:"
    
    payload = {
        "contents": [{
            "parts": [{"text": prompt}]
        }]
    }
    
    req_data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        url,
        data=req_data,
        headers={'Content-Type': 'application/json'}
    )
    
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            text = res_data['candidates'][0]['content']['parts'][0]['text']
            return text.strip()
    except Exception as e:
        # Fallback to local NLP on API error
        return None

# ----------------- Local Rule-Based NLP Engine -----------------
def local_nlp(query, context):
    query_lower = query.lower()
    
    # 1. Detect language (simple check for Kannada character range)
    is_kannada = any(0x0C80 <= ord(c) <= 0x0CFF for c in query)
    
    # Timings / Office Hours
    if any(k in query_lower for k in ["timing", "hour", "open", "close", "schedule", "work time"]) or \
       any(k in query_lower for k in ["ಸಮಯ", "ಯಾವಾಗ", "ತೆರೆದಿರುತ್ತದೆ", "ಅಧಿಕೃತ ಸಮಯ"]):
        return TIMINGS_KN if is_kannada else TIMINGS_EN
        
    # Contact Info
    if any(k in query_lower for k in ["contact", "phone", "email", "number", "location", "address", "call"]) or \
       any(k in query_lower for k in ["ಸಂಪರ್ಕ", "ಫೋನ್", "ಇಮೇಲ್", "ವಿಳಾಸ", "ಕರೆ"]):
        return CONTACT_KN if is_kannada else CONTACT_EN

    # Property Tax Details
    if any(k in query_lower for k in ["tax", "due", "pay", "amount", "defaulter", "payment"]) or \
       any(k in query_lower for k in ["ತೆರಿಗೆ", "ಬಾಕಿ", "ಪಾವತಿ", "ಹಣ"]):
        tax_t = context.get('tax_info')
        if tax_t:
            if is_kannada:
                return (
                    f"ನಿಮ್ಮ ಆಸ್ತಿ ತೆರಿಗೆ ವಿವರಗಳು:\n"
                    f"• ಆಸ್ತಿ ID: {tax_t.get('property_id')}\n"
                    f"• ಮಾಲೀಕರು: {tax_t.get('owner_name')}\n"
                    f"• ಬಾಕಿ ತೆರಿಗೆ: ₹{tax_t.get('tax_amount')}\n"
                    f"• ಸ್ಥಿತಿ: {tax_t.get('status')}\n"
                    f"• ಕೊನೆಯ ದಿನಾಂಕ: {tax_t.get('due_date')}\n"
                    f"• ಅಪಾಯದ ಮಟ್ಟ (ML): {tax_t.get('predicted_status', 'Low Risk')}\n"
                    f"ದಯವಿಟ್ಟು ನಾಗರಿಕ ಪೋರ್ಟಲ್‌ನಲ್ಲಿ ಆನ್‌ಲೈನ್‌ನಲ್ಲಿ ಪಾವತಿಸಿ."
                )
            else:
                return (
                    f"Your property tax details:\n"
                    f"• Property ID: {tax_t.get('property_id')}\n"
                    f"• Owner: {tax_t.get('owner_name')}\n"
                    f"• Tax Amount: ₹{tax_t.get('tax_amount')}\n"
                    f"• Status: {tax_t.get('status')}\n"
                    f"• Due Date: {tax_t.get('due_date')}\n"
                    f"• Default Risk (ML): {tax_t.get('predicted_status', 'Low Risk')}\n"
                    f"Please pay online using the Tax Search portal."
                )
        else:
            if is_kannada:
                return "ಬಾಕಿ ತೆರಿಗೆಯನ್ನು ಪರಿಶೀಲಿಸಲು ದಯವಿಟ್ಟು ನಿಮ್ಮ ಆಸ್ತಿ ID ಯನ್ನು ಒದಗಿಸಿ (ಉದಾಹರಣೆಗೆ: PROP002)."
            else:
                return "Please provide your Property ID (e.g. PROP002) in the portal to look up your outstanding tax dues."

    # Services list
    if any(k in query_lower for k in ["service", "certificate", "birth", "death", "marriage", "water", "connection", "licence", "license"]) or \
       any(k in query_lower for k in ["ಸೇವೆ", "ಪ್ರಮಾಣಪತ್ರ", "ಜನನ", "ಮರಣ", "ವಿವಾಹ", "ನೀರು", "ಸಂಪರ್ಕ"]):
        services = context.get('services', [])
        if len(services) > 0:
            titles = [s['title'] for s in services]
            if is_kannada:
                return f"ಗ್ರಾಮ ಪಂಚಾಯತಿಯಲ್ಲಿ ಲಭ್ಯವಿರುವ ಸಕ್ರಿಯ ಸೇವೆಗಳು:\n" + "\n".join([f"• {t}" for t in titles]) + "\nನಾಗರಿಕ ಪೋರ್ಟಲ್‌ನಲ್ಲಿ ನೀವು ಇವುಗಳಿಗೆ ಅರ್ಜಿ ಸಲ್ಲಿಸಬಹುದು."
            else:
                return f"Active services available at our Panchayat:\n" + "\n".join([f"• {t}" for t in titles]) + "\nYou can apply for these under the Services section."
        else:
            if is_kannada:
                return "ಗ್ರಾಮ ಪಂಚಾಯತಿ ಸೇವೆಗಳು: ಜನನ/ಮರಣ ಪ್ರಮಾಣಪತ್ರಗಳು, ನೀರು ಸಂಪರ್ಕ, ಮತ್ತು ಕಟ್ಟಡ ಅನುಮತಿ. ನಾಗರಿಕ ಪೋರ್ಟಲ್‌ನಲ್ಲಿ ಅರ್ಜಿ ಸಲ್ಲಿಸಿ."
            else:
                return "Panchayat services include Birth/Death Certificates, Water Connection, and Building Permissions. Apply directly via the Services portal."

    # Schemes
    if any(k in query_lower for k in ["scheme", "welfare", "subsidy", "pension", "farmer"]) or \
       any(k in query_lower for k in ["ಯೋಜನೆ", "ಪಿಂಚಣಿ", "ಸಹಾಯಧನ"]):
        schemes = context.get('schemes', [])
        if len(schemes) > 0:
            lines = [f"• {s['title']} (Eligibility: {s.get('eligibility', 'N/A')})" for s in schemes]
            if is_kannada:
                return f"ಲಭ್ಯವಿರುವ ಸರ್ಕಾರಿ ಯೋಜನೆಗಳು:\n" + "\n".join(lines)
            else:
                return f"Available Government Schemes:\n" + "\n".join(lines)
        else:
            if is_kannada:
                return "ಪ್ರಸ್ತುತ ಯಾವುದೇ ಸಕ್ರಿಯ ಯೋಜನೆಗಳಿಲ್ಲ."
            else:
                return "No active welfare schemes found at this moment."

    # Appointments
    if any(k in query_lower for k in ["appointment", "booking", "slot", "schedule", "reschedule"]) or \
       any(k in query_lower for k in ["ಅಪಾಯಿಂಟ್ಮೆಂಟ್", "ಭೇಟಿ", "ದಿನಾಂಕ"]):
        appts = context.get('appointments', [])
        if len(appts) > 0:
            lines = [f"• Slot: {a['appointment_date']} ({a['appointment_time']}) - Status: {a['status']}" for a in appts]
            if is_kannada:
                return f"ನಿಮ್ಮ ಕಚೇರಿ ಭೇಟಿ ಅಪಾಯಿಂಟ್ಮೆಂಟ್ ವಿವರಗಳು:\n" + "\n".join(lines)
            else:
                return f"Your offline appointment details:\n" + "\n".join(lines)
        else:
            if is_kannada:
                return "ನಿಮಗೆ ಯಾವುದೇ ಸಕ್ರಿಯ ಅಪಾಯಿಂಟ್ಮೆಂಟ್‌ಗಳು ನಿಗದಿಯಾಗಿಲ್ಲ. ಪೋರ್ಟಲ್‌ನಲ್ಲಿ ನಿಗದಿಪಡಿಸಿ."
            else:
                return "You have no active appointments scheduled. You can book a slot in your dashboard."

    # Complaints status tracking
    if any(k in query_lower for k in ["my complaint", "complaint status", "complaints tracker"]) or \
       any(k in query_lower for k in ["ದೂರಿನ ಸ್ಥಿತಿ", "ನನ್ನ ದೂರುಗಳು"]):
        compls = context.get('complaints', [])
        if len(compls) > 0:
            lines = [f"• Category: {c['category']} - Status: {c['status']} (Priority: {c['priority']})" for c in compls]
            if is_kannada:
                return f"ನಿಮ್ಮ ದೂರುಗಳ ಪ್ರಗತಿ:\n" + "\n".join(lines)
            else:
                return f"Your registered complaints progress:\n" + "\n".join(lines)
        else:
            if is_kannada:
                return "ನಿಮ್ಮ ಖಾತೆಗೆ ಯಾವುದೇ ದೂರುಗಳು ನೋಂದಾಯಿಸಲ್ಪಟ್ಟಿಲ್ಲ."
            else:
                return "No complaints registered under your account."

    # Complaints filing
    if any(k in query_lower for k in ["complaint", "file", "register", "report", "issue"]) or \
       any(k in query_lower for k in ["ದೂರು", "ಸಲ್ಲಿಸಲು", "ನೋಂದಣಿ"]):
        if is_kannada:
            return "ನೀವು ನಾಗರಿಕ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್‌ನಲ್ಲಿ ದೂರನ್ನು ಸಲ್ಲಿಸಬಹುದು. ಗ್ರಾಮಿತ್ರ ಎಐ ಸ್ವಯಂಚಾಲಿತವಾಗಿ ವರ್ಗವನ್ನು ಸೂಚಿಸುತ್ತದೆ ಮತ್ತು ಅದರ ಆದ್ಯತೆಯನ್ನು ಊಹಿಸುತ್ತದೆ."
        else:
            return "You can file a complaint on the Citizen Dashboard. GramMitra AI will automatically suggest the category and predict priority based on your description."

    # Announcements
    if any(k in query_lower for k in ["announcement", "news", "update", "meeting", "gram sabha"]) or \
       any(k in query_lower for k in ["ಪ್ರಕಟಣೆ", "ಸುದ್ದಿ", "ಸಭೆ", "ಮಾಹಿತಿ"]):
        anns = context.get('announcements', [])
        if len(anns) > 0:
            lines = [f"• {a['title']}: {a['message']}" for a in anns]
            if is_kannada:
                return f"ಇತ್ತೀಚಿನ ಪ್ರಕಟಣೆಗಳು:\n" + "\n".join(lines)
            else:
                return f"Latest announcements from the Panchayat:\n" + "\n".join(lines)
        else:
            if is_kannada:
                return "ಪ್ರಸ್ತುತ ಯಾವುದೇ ಸಕ್ರಿಯ ಪ್ರಕಟಣೆಗಳಿಲ್ಲ. ದಯವಿಟ್ಟು ನಂತರ ಪರಿಶೀಲಿಸಿ."
            else:
                return "No active announcements at the moment. Please check back later."

    # Greeting
    if any(k in query_lower for k in ["hello", "hi", "hey", "namaste", "good morning"]) or \
       any(k in query_lower for k in ["ನಮಸ್ಕಾರ", "ಹಲೋ"]):
        if is_kannada:
            return "ನಮಸ್ಕಾರ! ನಾನು ಗ್ರಾಮಿತ್ರ ಎಐ, ನಿಮ್ಮ ಪಂಚಾಯತ್ ಸಹಾಯಕ. ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ? ನೀವು ತೆರಿಗೆ, ಯೋಜನೆಗಳು, ಸೇವೆಗಳು ಅಥವಾ ದೂರುಗಳ ಬಗ್ಗೆ ಕೇಳಬಹುದು."
        else:
            return "Hello! I am GramMitra AI, your Panchayat assistant. How can I help you today? You can ask me about tax dues, government schemes, services, complaints, or office timings."

    # Default refusal / prompt
    if is_kannada:
        return "ಕ್ಷಮಿಸಿ, ನಾನು ಗ್ರಾಮಿತ್ರ ಎಐ. ಪಂಚಾಯತ್ ಸೇವೆಗಳು, ತೆರಿಗೆಗಳು, ಕಚೇರಿ ಸಮಯ ಅಥವಾ ದೂರುಗಳಿಗೆ ಸಂಬಂಧಿಸಿದ ಪ್ರಶ್ನೆಗಳಿಗೆ ಮಾತ್ರ ನಾನು ಉತ್ತರಿಸಬಲ್ಲೆ."
    else:
        return "I am GramMitra AI. I can only assist you with Gram Panchayat related questions regarding services, property tax, complaints, timings, or government schemes."

# ----------------- Main CLI Handler -----------------
def main():
    if len(sys.argv) < 3:
        print("GramMitra AI Chatbot - Missing arguments")
        return
        
    query = ""
    context_str = "{}"
    
    # Parse arguments
    for i in range(1, len(sys.argv)):
        if sys.argv[i] == "--query" and i+1 < len(sys.argv):
            query = sys.argv[i+1]
        elif sys.argv[i] == "--context" and i+1 < len(sys.argv):
            context_str = sys.argv[i+1]
            
    try:
        context = json.loads(context_str)
    except Exception:
        context = {}
        
    # Check if Gemini API key is available
    api_key = os.environ.get("GEMINI_API_KEY") or context.get("gemini_api_key")
    
    response = None
    if api_key:
        response = ask_gemini(query, context, api_key)
        
    # If no api_key or Gemini failed, fallback to local NLP
    if not response:
        response = local_nlp(query, context)
        
    print(response)

if __name__ == "__main__":
    main()
