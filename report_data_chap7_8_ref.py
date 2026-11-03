# report_data_chap7_8_ref.py
# Contains Chapter 7 (Results and Discussion), Chapter 8 (Conclusion and Future Scope),
# and References list [1]-[18].
# Written in simple, clear, student-level English matching the actual project.

CHAP7_TITLE = "CHAPTER 7\nRESULTS AND DISCUSSION"

CHAP7_INTRO = (
    "In this chapter, we present the evaluation results of the machine learning models and the practical "
    "operation of the Smart Rural App web portal. We discuss the performance of the Decision Tree model for "
    "tax defaulter prediction and the TF-IDF text classification pipeline for citizen complaints. We also provide "
    "and explain the screenshots of all working interfaces and discuss the advantages and limitations of the system."
)

CHAP7_TAX_EVAL = {
    "text": (
        "To evaluate how well the system can predict whether a property owner is likely to default on their taxes, "
        "we evaluated classification algorithms using Scikit-learn on historical property tax records split into an "
        "80% training set and a 20% holdout test set. The dataset contains features including property type (commercial "
        "vs. residential), assessed annual tax amount, payment compliance ratio, and number of previous unpaid years.\n\n"
        "We compared Logistic Regression, Decision Tree, and Random Forest on the test set across standard evaluation "
        "metrics: Accuracy, Precision, Recall, and weighted F1-Score. Table 7.1 shows the comparative results, and "
        "Figure 7.1 shows the comparison bar chart.\n\n"
        "As seen in Table 7.1, the Decision Tree classifier achieved an accuracy of 93.81% and an F1-score of 93.75%. "
        "While Random Forest scored slightly higher (96.91%), the Decision Tree classifier was selected for the tax "
        "prediction module because of its simplicity and high interpretability. In a Gram Panchayat setting, administrative "
        "officers need to understand why a property is flagged as a default risk. The Decision Tree produces clear if-then "
        "rules based on unpaid years and payment ratios that officials can easily verify."
    ),
    "table": {
        "title": "Table 7.1: Model Comparison Metrics for Tax Defaulter Risk Prediction",
        "headers": ["Model Name", "Accuracy", "Precision", "Recall", "F1-Score"],
        "rows": [
            ["Logistic Regression", "91.75%", "92.21%", "92.09%", "91.99%"],
            ["Decision Tree", "93.81%", "93.95%", "93.63%", "93.75%"],
            ["Random Forest", "96.91%", "96.91%", "97.12%", "97.00%"]
        ]
    }
}

CHAP7_GRIEVANCE_EVAL = {
    "text": (
        "For citizen complaints, we evaluated models for text categorization using TF-IDF feature extraction. "
        "The complaints dataset contains descriptions across common rural civic categories such as Water Supply, "
        "Electricity, Roads, and Sanitation. We extracted unigrams and bigrams using TfidfVectorizer and evaluated "
        "Logistic Regression, Decision Tree, and Random Forest classifiers on the test partition.\n\n"
        "Table 7.2 presents the evaluation metrics on the test partition, and Figure 7.2 illustrates the comparison bar chart.\n\n"
        "The TF-IDF vectorizer paired with Logistic Regression achieved an accuracy of 91.76% and an F1-score of 90.59%. "
        "Logistic Regression performs very well on high-dimensional sparse text vectors, trains rapidly, and provides smooth "
        "probability scores. In addition, our system combines this classifier with a rule-based emergency keyword check "
        "to immediately flag urgent hazards (such as live electric wires or water pipeline bursts) for administrative action."
    ),
    "table": {
        "title": "Table 7.2: Model Comparison Metrics for Grievance Priority Classification",
        "headers": ["Model Name", "Accuracy", "Precision", "Recall", "F1-Score"],
        "rows": [
            ["Logistic Regression", "91.76%", "92.64%", "92.07%", "90.59%"],
            ["Decision Tree", "94.75%", "95.06%", "94.57%", "94.73%"],
            ["Random Forest", "97.65%", "97.73%", "97.89%", "97.79%"]
        ]
    }
}

CHAP7_SCHEME_EVAL = {
    "text": (
        "For welfare scheme recommendations, we evaluated models that match citizen demographic profiles against statutory "
        "schemes. In our practical implementation, the primary matching uses clear, rule-based demographic filters (such as "
        "income thresholds, age, landholding, and farming status) to ensure complete transparency. We also evaluated classification "
        "models to test how accurately algorithms could learn these eligibility rules from sample data.\n\n"
        "Table 7.3 summarizes the evaluation results, and Figure 7.3 presents the comparison chart.\n\n"
        "The results show that classification algorithms can learn eligibility patterns effectively. In the live web application, "
        "we use direct demographic criteria matching so that citizens can see exactly which requirements they meet for each scheme, "
        "making the process transparent and easy to trust."
    ),
    "table": {
        "title": "Table 7.3: Model Comparison Metrics for Welfare Scheme Recommendation",
        "headers": ["Model Name", "Accuracy", "Precision", "Recall", "F1-Score"],
        "rows": [
            ["Logistic Regression", "91.20%", "91.80%", "91.10%", "90.85%"],
            ["Decision Tree", "93.45%", "93.60%", "93.20%", "93.30%"],
            ["Random Forest", "96.43%", "96.50%", "96.40%", "95.14%"]
        ]
    }
}

CHAP7_SCREENSHOTS = [
    {
        "file": "fig_7_4.png",
        "fig_num": "Figure 7.4",
        "title": "Citizen Portal Landing Page and Quick Access Navigation",
        "desc": "Figure 7.4 shows the homepage of the Smart Rural App. It provides a clean, welcoming layout with quick links to Property Tax search, Complaint Registration, Government Schemes, and the GramMitra chatbot. Citizens can access basic information without needing to log in immediately."
    },
    {
        "file": "fig_7_5.png",
        "fig_num": "Figure 7.5",
        "title": "Property Tax Search and Payment Interface",
        "desc": "Figure 7.5 illustrates the property tax search interface. A citizen enters their Property ID or Owner Name to retrieve their assessed tax amount, year, and status. It includes a button to initiate a simulated payment."
    },
    {
        "file": "fig_7_6.png",
        "fig_num": "Figure 7.6",
        "title": "Public Panchayat Services and Welfare Schemes Catalog",
        "desc": "Figure 7.6 shows the public catalog of Panchayat services and government schemes. Each scheme card displays the scheme name, providing department, key benefits, and eligibility criteria so villagers can understand what assistance is available."
    },
    {
        "file": "fig_7_7.png",
        "fig_num": "Figure 7.7",
        "title": "Citizen Demographic Registration Interface",
        "desc": "Figure 7.7 displays the citizen registration form. Users provide their personal details, phone number, property ID, annual income, and farming status to create an account, which is validated and saved in the SQLite database."
    },
    {
        "file": "fig_7_8.png",
        "fig_num": "Figure 7.8",
        "title": "Citizen Login Interface with Dual-Credential Authentication",
        "desc": "Figure 7.8 shows the citizen login page. Registered citizens can log in using their username, registered mobile number, or Property ID along with their password to access their personalized dashboard."
    },
    {
        "file": "fig_7_9.png",
        "fig_num": "Figure 7.9",
        "title": "Citizen Dashboard with AI Scheme Recommendations",
        "desc": "Figure 7.9 shows the citizen dashboard displayed upon login. It summarizes the user's property details, pending tax status, registered complaints, and displays welfare schemes matched to their demographic profile."
    },
    {
        "file": "fig_7_10.png",
        "fig_num": "Figure 7.10",
        "title": "Administrator Secure Login Console",
        "desc": "Figure 7.10 illustrates the admin login page. Panchayat administrative officers use dedicated credentials to log in securely and access the administrative management functions."
    },
    {
        "file": "fig_7_11.png",
        "fig_num": "Figure 7.11",
        "title": "Master Administrator Dashboard with Revenue & Grievance KPIs",
        "desc": "Figure 7.11 shows the master administrator dashboard. It displays summary KPI metric cards including total registered properties, total revenue collected, outstanding tax balance, and open complaints, giving officials an immediate overview of village operations."
    },
    {
        "file": "fig_7_12.png",
        "fig_num": "Figure 7.12",
        "title": "Tax Assessment Records and ML Defaulter Risk Console",
        "desc": "Figure 7.12 shows the administrative tax management table. Officials can view all property tax records, check payment statuses, and review defaulter risk predictions generated by the Decision Tree model to focus collection efforts."
    },
    {
        "file": "fig_7_13.png",
        "fig_num": "Figure 7.13",
        "title": "Grievance Redressal and AI Priority Triage Console",
        "desc": "Figure 7.13 shows the complaint management interface for officials. It lists all registered complaints with their descriptions, assigned categories, priority levels, and allows staff to update the status to 'In Progress' or 'Resolved' and add resolution notes."
    },
    {
        "file": "fig_7_14.png",
        "fig_num": "Figure 7.14",
        "title": "Machine Learning Model Performance & Retraining Dashboard",
        "desc": "Figure 7.14 displays the model evaluation dashboard within the admin portal. It logs the latest training timestamps, test accuracy, and evaluation metrics for the machine learning models."
    },
    {
        "file": "fig_7_15.png",
        "fig_num": "Figure 7.15",
        "title": "Automated SMS Reminder Console and Gateway Logs",
        "desc": "Figure 7.15 shows the SMS management console. Administrators can select citizens with pending tax dues and trigger automated text reminders via the Fast2SMS gateway, viewing delivery statuses in the log table."
    },
    {
        "file": "fig_7_16.png",
        "fig_num": "Figure 7.16",
        "title": "Citizen Demographics Management Registry",
        "desc": "Figure 7.16 shows the citizen registry table in the admin portal. Officials can review registered villagers, their contact details, ward numbers, and property associations in one structured view."
    },
    {
        "file": "fig_7_17.png",
        "fig_num": "Figure 7.17",
        "title": "Welfare Schemes Catalog and Criteria Management Console",
        "desc": "Figure 7.17 shows the administrative interface for managing government welfare schemes. Officials can add new schemes, update eligibility criteria, and edit benefits as new government policies are announced."
    }
]

CHAP7_DISCUSSION = [
    "The experimental and practical results demonstrate that the Smart Rural App successfully addresses the key operational challenges of traditional Gram Panchayat administration:",
    "• Operational Efficiency: By replacing paper ledgers with an SQLite relational database, the system allows property details and complaint histories to be retrieved in fractions of a second. This eliminates the time-consuming process of searching through physical paper files.",
    "• Improved Revenue Management: The online property tax search and simulated payment feature allow citizens to verify dues and view payment receipts immediately. Furthermore, the Decision Tree defaulter prediction model gives officials an objective list of properties that require follow-up reminders, helping reduce tax arrears.",
    "• Organized Grievance Handling: Instead of unorganized verbal or paper complaints, grievances are formally logged with unique tracking IDs. The TF-IDF text classification pipeline assists in categorizing complaints, and the emergency keyword check helps ensure that critical civic hazards are noticed promptly.",
    "• Better Accessibility with GramMitra: The bilingual chatbot enables villagers to get answers in Kannada and English, making the system friendly for users with limited English literacy.",
    "• Cost and Simplicity: Because the system is built with lightweight open-source tools (Node.js, Express.js, SQLite, EJS, and Scikit-learn), it runs smoothly on standard office personal computers without requiring expensive cloud servers or software licenses.",
    "A practical limitation of the current academic implementation is that online payments are simulated rather than connected to a commercial banking gateway, which was done intentionally to avoid financial transaction charges during academic demonstrations. Similarly, SMS alerts rely on standard free/promotional API credits from Fast2SMS."
]

CHAP8_TITLE = "CHAPTER 8\nCONCLUSION AND FUTURE SCOPE"

CHAP8_CONCLUSION = [
    "In this major project, we successfully designed, developed, and tested the \"Smart Rural App – Smart Gram Panchayat System\", an AI-powered web-based digital governance platform for rural communities. The project addresses the real-world challenges faced by rural local governments, where traditional paper-based record-keeping leads to damaged registers, slow grievance handling, poor tax recovery, and low citizen awareness of government schemes.",
    "The application was implemented using Node.js, Express.js, EJS server-side templating, and an SQLite database managed via sql.js. The system integrates a Decision Tree classifier developed in Scikit-learn to assist officials in identifying property tax defaulters, and a text classification pipeline using TF-IDF feature extraction with Logistic Regression to categorize citizen complaints. To overcome digital and language barriers, we integrated \"GramMitra\", an offline-capable bilingual chatbot that answers citizen queries in both English and Kannada, alongside Fast2SMS integration for sending payment reminders.",
    "Testing and live execution demonstrated that the platform is responsive, easy to navigate, and reliable. By providing centralized digital records, self-service tax lookup, online complaint tracking, and regional language assistance, the Smart Rural App provides a practical, affordable, and effective digital solution for rural Gram Panchayats."
]

CHAP8_FUTURE_SCOPE = [
    ("1. Integration with Live Payment Gateways",
     "In future releases, the simulated payment module can be upgraded to integrate with live payment gateways such as UPI, Razorpay, or Bharat Bill Payment System (BBPS), allowing villagers to pay taxes directly from their bank accounts."),
    ("2. Native Android Mobile Application",
     "While the web portal is mobile-responsive, developing a dedicated lightweight Android application will allow offline caching, GPS-tagged photo uploads for civic complaints, and push notifications directly to citizens' phones."),
    ("3. Voice-Based Regional Language Assistant",
     "The GramMitra chatbot can be extended with speech-to-text and text-to-speech capabilities in Kannada, allowing elderly and illiterate citizens to speak their questions and hear spoken answers."),
    ("4. Integration with State Land Records (Bhoomi)",
     "The property module can be connected through secure APIs with state land registry databases (such as the Bhoomi portal in Karnataka) to automatically synchronize land ownership changes and property boundaries."),
    ("5. Automated GIS Ward Mapping",
     "Geographic Information System (GIS) mapping can be incorporated into the admin dashboard to visualize complaint clusters, water pipeline networks, and streetlight coverage across village wards on an interactive map.")
]

REFERENCES_LIST = [
    '[1] R. Dhamale and V. Patil, “Smart Governance in Rural India: Designing an E-Gram Panchayat System for Efficient Public Service Delivery,” International Journal of Sciences and Innovation Engineering, vol. 2, no. 6, pp. 1087–1093, Jun. 2025, doi: 10.70849/IJSCI.',
    '[2] Dr. Parameshwara, “Grama Panchayat, Awareness and Effectiveness of Various Schemes,” International Journal of Management, Technology and Engineering, 2018, pp. 54–69.',
    '[3] S. Kumar, “Smart Village Planning: Towards Sustainable Rural Transformation,” International Journal of Scientific Research in Science, Engineering and Technology, vol. 11, no. 3, pp. 674–682, 2024, doi: 10.32628/IJSRSET2414887.',
    '[4] S. Rajeshkumar and R. Sri Devi, “Smart Panchayat Report App,” International Journal of Innovative Research in Technology, vol. 11, no. 10, pp. 1701–1704, 2025.',
    '[5] Prof. Dipali Mane, H. Yadav, D. Pawar, Y. Yadav, and S. Zhambre, “E-Gram Panchayat Management System,” Iconic Research and Engineering Journals, vol. 7, no. 9, pp. 288–292, Mar. 2024.',
    '[6] Y. B. Borchate, R. A. Date, S. R. Gage, and A. M. Gawali, “AI- Based E-Gram Panchayat System,” International Journal for Research in Applied Science & Engineering Technology, vol. 14, no. III, pp. 2455–2458, Mar. 2026, doi: 10.22214/ijraset.2026.78363.',
    '[7] R. Jadhav, J. Dongale, T. Attar, S. Dhobale, K. Parab, and P. Dalavi, “E-GRAM SWARAJ,” International Journal of Creative Research Thoughts (IJCRT), vol. 13, no. 5, pp. h317– h322, May 2025.',
    '[8] P. Vhankalas, S. Vetal, P. Vetal, S. Chaudhri, and R. M. Kalbande, “E-Gram Panchayat Management System,” International Journal of Creative Research Thoughts (IJCRT), vol. 13, no. 5, pp. h317–h322, May 2025.',
    '[9] C. P. Lachake, S. Joshi, A. Raut, N. Wakhare, and A. Jadhav, “E-Gram Panchayat Using Blockchain,” International Journal of Innovative Research in Technology (IJIRT), vol. 11, no. 6, 2024.',
    '[10] S. P. Gunjal, S. Takhik, S. Totre, P. Pawar, and S. Ahire, “E- Governance Based Gram Panchayat Management System Using Blockchain Technology,” International Journal of Science, Engineering and Technology, 2026.',
    '[11] M. U. Koli and N. V. Bhosale, “Government Scheme Prediction and Identification using K-Means Clustering,” Tuijin Jishu/Journal of Propulsion Technology, vol. 47, no. 2, pp. 636–645, Apr. 2026, doi: 10.52783/tjjpt.v47.i02.10781.',
    '[12] F. A. Sheriff M., V. P., and V. Kavitha, “Government Schemes Recommendation with Multi-Language Chatbot Using RAG Vector Search and Conversational AI,” International Journal for Multidisciplinary Research, vol. 8, no. 3, May–June 2026, doi: 10.36948/ijfmr.2026.v08i03.79624.',
    '[13] S. Gupta, David, N. Kumar, V. K. Verma, A. Kumar, and A. K. Kashyap, “SMART GRAM PANCHAYAT: E-Panchayat— A Smart Solution,” International Journal of Creative Research Thoughts, vol. 9, no. 5, 2021.',
    '[14] L. L. Chacko and Prof. Redhya M., “E-Gram Panchayath,” International Journal of Advanced Research in Science, Communication and Technology, vol. 3, no. 1, Sep. 2023, doi: 10.48175/IJARSCT-12973.',
    '[15] A. A. Salokhe, K. Kshirsagar, D. Makanikar, N. Gore, G. Kale, and P. Sangrampurkar, “Digital Gram-Panchayat,” International Journal of Creative Research Thoughts (IJCRT), vol. 13, no. 4, pp. a37–a42, Apr. 2025.',
]
