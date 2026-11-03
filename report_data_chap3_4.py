# report_data_chap3_4.py
# Contains Chapter 3 (System Analysis) and Chapter 4 (System Design)
# Written in simple, clear, student-level English matching the actual project.

CHAP3_TITLE = "CHAPTER 3\nSYSTEM ANALYSIS"

CHAP3_INTRO = (
    "System analysis is an important phase in the software development lifecycle. In this chapter, we analyze "
    "the existing manual procedures followed in Gram Panchayats, discuss their main drawbacks, describe the "
    "proposed web-based digital solution, and evaluate its feasibility across technical, economic, and "
    "operational dimensions."
)

CHAP3_EXISTING_SYSTEM = [
    "In the existing system, almost all administrative work in a Gram Panchayat is carried out manually using paper files and ledgers. When a citizen needs to pay property taxes, report a broken utility, or inquire about welfare schemes, they must visit the Panchayat office in person. Clerical staff manually search through large registers to locate the property record, calculate the tax amount due, write a paper receipt, and enter the payment in a daily collection book.",
    "Similarly, when a resident reports a grievance such as a damaged road, broken water pipeline, or failing streetlight, the complaint is written into a physical register or noted on a paper slip. There is no automated system to categorize complaints, flag emergency situations, or send updates to the resident. In addition, information regarding government welfare schemes is either displayed on office bulletin boards or communicated verbally. Villagers living in distant wards rarely receive this information in time, leading to poor scheme participation and missed welfare opportunities."
]

CHAP3_DRAWBACKS = [
    ("1. Vulnerability of Paper Records",
     "Physical ledgers are susceptible to damage from water, moisture during rainy seasons, termites, and accidental fire. Over time, pages tear, handwriting becomes illegible, and misplaced files can cause permanent loss of critical land and tax data."),
    ("2. Time-Consuming and Inconvenient",
     "Citizens must travel long distances to the Panchayat office and wait in queues, often losing their daily wages. If the concerned officer is away for fieldwork or meetings, the citizen must return another day."),
    ("3. Revenue Leakage and Tax Delinquency",
     "Because tax records are maintained manually without automated alerts, staff cannot easily identify which property owners have missed multiple payment deadlines. This leads to large accumulated tax arrears that reduce the Panchayat's development funds."),
    ("4. Lack of Grievance Tracking and Accountability",
     "Complaints written on paper cannot be easily monitored by senior officials. Citizens have no tracking number to check progress, and there is no systematic way to identify urgent complaints such as water pipeline bursts or fallen electrical wires."),
    ("5. Language and Information Gaps",
     "Most state-level government websites are in English and use complicated terminology that is difficult for rural residents to understand. There is no local conversational tool to guide them in their native language (such as Kannada).")
]

CHAP3_PROPOSED_SYSTEM = [
    "To overcome the limitations of the existing manual setup, we designed and developed the \"Smart Rural App – Smart Gram Panchayat System\". It is a lightweight, web-based digital governance platform that brings all essential Panchayat operations into a single online system. The proposed system provides separate, secure access for citizens and Panchayat officials.",
    "The key capabilities of the proposed system include:",
    "• Centralized Digital Database: All property records, tax demands, payment histories, complaints, and scheme details are stored in an SQLite relational database, eliminating paper loss and making search instantaneous.",
    "• Property and Tax Management: Citizens can search for their property by ID or owner name, check outstanding tax dues, simulate online payments, and download payment receipts. A Decision Tree classifier analyzes payment history to identify properties likely to default, helping staff take proactive steps.",
    "• Smart Complaint Management: Citizens can submit civic grievances online with descriptions and photos/categories. The system uses TF-IDF and Logistic Regression to categorize complaints automatically and checks for emergency keywords, helping staff prioritize urgent repairs.",
    "• Government Welfare Schemes: The platform includes a catalog of active government schemes, allowing villagers to easily check criteria and discover schemes suitable for their household.",
    "• Bilingual Virtual Assistant (GramMitra): An offline-capable chatbot answers common citizen questions in English and Kannada, making the platform easy to navigate for all villagers.",
    "• Automated SMS Alerts: The system connects to the Fast2SMS gateway to send direct text notifications and payment reminders to citizens' mobile phones."
]

CHAP3_FEASIBILITY = {
    "technical": (
        "The project is technically feasible because it is built using proven, widely adopted open-source technologies. "
        "The backend is developed with Node.js and Express.js, which are lightweight and handle asynchronous requests efficiently. "
        "The user interface uses Embedded JavaScript (EJS) templates styled with standard CSS and Bootstrap 5, ensuring that pages "
        "load quickly on both mobile browsers and desktop monitors. The database uses SQLite (sql.js), which is a self-contained, "
        "zero-configuration relational database engine that runs locally without needing complex database server setup. "
        "Machine learning models are developed using Python and Scikit-learn, executing smoothly on standard office hardware. "
        "Therefore, no specialized or expensive infrastructure is needed to run the system."
    ),
    "economic": (
        "The system is economically feasible because all core software components—Node.js, Express.js, SQLite, Python, Scikit-learn, "
        "and Bootstrap—are completely free and open-source, requiring zero software licensing costs. The system is designed to run "
        "on existing desktop computers available in Gram Panchayat offices (with 4 GB to 8 GB RAM), eliminating the need to purchase "
        "expensive servers. The only ongoing operational expense is minimal SMS gateway credits through Fast2SMS, which is very affordable. "
        "By reducing paper usage, cutting clerical effort, and improving tax collection, the system offers substantial cost savings."
    ),
    "operational": (
        "The platform is operationally feasible because it is designed specifically for rural users and local staff. The user interface "
        "is straightforward, with clear navigation buttons, readable fonts, and regional language support (Kannada) via the GramMitra "
        "chatbot. Rural citizens can access services from home using smartphones or visit a local Common Service Centre (CSC). "
        "For Panchayat staff, the admin dashboard simplifies daily record-keeping and automatically computes revenue summaries, "
        "reducing administrative workload and errors. As a result, both citizens and staff can easily adapt to the system."
    )
}

CHAP4_TITLE = "CHAPTER 4\nSYSTEM DESIGN"

CHAP4_INTRO = (
    "System design translates the functional and operational requirements into an architectural blueprint. "
    "This chapter explains the system architecture, individual module functions, relational database design, "
    "data flow diagrams, UML use case modeling, workflow logic, sequence interactions, and deployment structure."
)

CHAP4_ARCH_LAYERS = [
    ("1. Client / Presentation Layer",
     "The presentation layer provides the user interface for citizens and administrators. It is built using HTML5, CSS3, JavaScript, and Bootstrap 5, rendered on the server using EJS templates. It ensures that the web portal is responsive and easy to use on both mobile phones and desktop computers."),
    ("2. Application / API Layer",
     "The backend application layer is developed using Node.js and the Express.js framework. It handles incoming HTTP requests, session management, user authentication, business logic for tax calculations, complaint status updates, and communication with the machine learning scripts."),
    ("3. Machine Learning Subsystem",
     "The machine learning subsystem consists of Python scripts using Scikit-learn. It includes a Decision Tree classifier for property tax defaulter risk prediction and a text classification pipeline using TF-IDF feature extraction with Logistic Regression for complaint categorization and triage."),
    ("4. Data Persistence Layer",
     "The data layer consists of an SQLite relational database (panchayat.db) accessed via sql.js. It securely stores all master tables including users, administrators, property records, tax assessments, complaints, schemes, and SMS transmission logs."),
    ("5. External Telecommunications Gateway",
     "The external gateway layer connects the application to the Fast2SMS REST API. It handles automated sending of individual and bulk SMS text alerts for tax payment deadlines and status notifications.")
]

CHAP4_MODULES = [
    ("1. Authentication and Role-Based Access Control Module",
     "Manages secure registration and login for citizens and administrators. Citizens can register with their demographic details and property ID, while administrators log in with dedicated administrative credentials."),
    ("2. Property and Tax Management Module",
     "Allows citizens and staff to search for properties, view property types (residential or commercial), dimensions, annual tax amounts, and payment histories. Staff can add new properties and update records."),
    ("3. Payment Module",
     "Enables citizens to review their tax dues and complete simulated online payments. Upon successful payment simulation, the system automatically updates the tax status in the database to 'Paid' and generates a downloadable digital receipt with a unique transaction reference."),
    ("4. Grievance Redressal and Management Module",
     "Allows citizens to lodge civic complaints regarding issues such as water supply, roads, sanitation, or electricity. The system records the complaint, assists in categorization using TF-IDF and Logistic Regression, checks for emergency keywords, and provides a tracking ID for status monitoring."),
    ("5. Public Services and Welfare Schemes Catalog Module",
     "Displays all active government welfare schemes and village services. Citizens can view scheme descriptions, eligibility criteria, required documents, and benefits."),
    ("6. Scheme Eligibility Matching Module",
     "Helps citizens identify which government schemes match their demographic profile (such as age, annual income, land ownership, and occupation) through clear, explainable criteria matching."),
    ("7. Automated SMS Reminders and Notification Module",
     "Provides administrative tools to send SMS alerts to citizens regarding due dates, pending tax amounts, and official announcements via the Fast2SMS API."),
    ("8. Bilingual AI Virtual Assistant (GramMitra) Module",
     "An offline-capable conversational chatbot supporting English and Kannada. It uses keyword and bigram matching against a structured FAQ database to answer common questions regarding Panchayat services, office timings, tax rules, and schemes.")
]

CHAP4_SCHEMA_TABLE = {
    "title": "Table 4.1: Relational Database Schema and Constraints",
    "headers": ["Table Name", "Primary Key", "Foreign Key", "Key Attributes", "Description"],
    "rows": [
        ["users", "id (INTEGER)", "property_id -> properties", "name, email, phone, password, income, is_farmer, ward", "Stores citizen registration profiles and demographics"],
        ["admins", "id (INTEGER)", "None", "username, password, full_name, email, role", "Stores administrative credentials for Panchayat officials"],
        ["properties", "property_id (TEXT)", "None", "owner_name, property_type, ward, dimensions, address", "Stores registered village properties and land records"],
        ["tax_records", "id (INTEGER)", "property_id -> properties", "tax_amount, year, status, paid_date, receipt_no", "Stores annual tax assessments and payment status"],
        ["complaints", "id (INTEGER)", "user_id -> users", "description, category, priority, status, ward, created_at, remarks", "Stores registered citizen grievances and resolution progress"],
        ["schemes", "id (INTEGER)", "None", "scheme_name, department, description, eligibility_criteria, benefits", "Stores government welfare schemes and eligibility rules"],
        ["sms_logs", "id (INTEGER)", "None", "recipient_phone, message_text, status, sent_at", "Stores outgoing SMS notifications and delivery status"]
    ]
}

CHAP4_DFD_TEXT = [
    "Data Flow Diagrams (DFDs) illustrate how information moves through the Smart Rural App between users, processes, and data stores:",
    "• Level 0 DFD (Context Level): Shows the entire application as a single central process interacting with two external entities—Citizen and Administrator. Citizens provide registration details, tax queries, and complaint descriptions, receiving tax receipts, complaint status, and scheme information in return. Administrators supply updates to property records and resolve complaints, receiving summary statistics and model predictions. Figure 4.4 illustrates the Level 0 DFD.",
    "• Level 1 DFD: Decomposes the system into its core functional sub-processes: User Authentication (Process 1.0), Property Tax Management (Process 2.0), Payment Processing (Process 3.0), Grievance Redressal (Process 4.0), Welfare Scheme Catalog (Process 5.0), and SMS Notifications (Process 6.0). Figure 4.5 shows the Level 1 DFD."
]

CHAP4_UML_TEXT = (
    "The Unified Modeling Language (UML) Use Case diagram models the functional interactions between the primary actors "
    "(Citizen and Administrator) and the system modules. Citizens can perform use cases such as Register, Login, Search Property Tax, "
    "Simulate Payment, Register Complaint, Track Status, View Schemes, and Chat with GramMitra. Administrators perform use cases "
    "such as Manage Properties, Update Tax Records, Review Grievances, View ML Defaulter Predictions, and Send SMS Reminders. "
    "Figure 4.6 presents the UML Use Case Diagram."
)

CHAP4_WORKFLOW_TEXT = (
    "The overall system workflow represents the step-by-step logic followed during runtime. When a user accesses the portal, "
    "the system determines their role based on authentication. Citizens can navigate between tax payment, grievance submission, "
    "and scheme browsing. If a complaint is submitted, the system checks for emergency keywords and categorizes the issue. "
    "If a tax payment is completed, the database updates the record to 'Paid' and issues a receipt. Administrators can log in to "
    "monitor daily activity and view reports. Figure 4.7 illustrates the overall workflow flowchart."
)

CHAP4_SEQUENCE_TEXT = (
    "The sequence diagram illustrates the chronological exchange of messages between the Citizen, Web Browser, Node.js Backend, "
    "SQLite Database, and the ML categorization subsystem during the grievance redressal process. When a citizen submits a complaint, "
    "the backend processes the text, invokes the classifier, saves the complaint with its assigned category and priority in the database, "
    "and returns a confirmation with a tracking ID to the user interface. Figure 4.8 presents the Sequence Diagram."
)

CHAP4_DEPLOYMENT_TEXT = (
    "The deployment diagram depicts the physical deployment architecture. The application is hosted on an office computer or local "
    "server running Node.js and Python. The client connects through web browsers over local network (LAN) or standard HTTP. "
    "The Node.js server accesses the local SQLite database file directly on the disk and calls the Fast2SMS gateway over HTTPS for SMS alerts. "
    "Figure 4.9 shows the deployment architecture."
)
