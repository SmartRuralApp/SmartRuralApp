# report_data_chap5_6.py
# Contains Chapter 5 (Requirement Specification) and Chapter 6 (Implementation)
# Written in simple, clear, student-level English matching the actual project.

CHAP5_TITLE = "CHAPTER 5\nREQUIREMENT SPECIFICATION"

CHAP5_INTRO = (
    "Requirement specification outlines the hardware, software, functional, and non-functional requirements "
    "necessary to develop, deploy, and operate the Smart Rural App successfully. These requirements ensure that "
    "the platform runs smoothly on standard computer systems commonly available in rural administrative offices."
)

CHAP5_HARDWARE_PARAS = [
    "The Smart Rural App is designed to be lightweight and resource-efficient. It does not require high-end servers or specialized hardware. A standard desktop computer or laptop available in a Gram Panchayat office is sufficient to run the application server and the database.",
    "For citizens, the application can be accessed through standard smartphones, tablets, or desktop personal computers using any modern web browser. Table 5.1 outlines the minimum and recommended hardware specifications for running the system."
]

CHAP5_HARDWARE_TABLE = {
    "title": "Table 5.1: Minimum and Recommended Hardware Specifications",
    "headers": ["Component", "Client Device (Citizen)", "Minimum Server Spec", "Recommended Server Spec"],
    "rows": [
        ["Processor", "Any modern smartphone or PC processor", "Dual-core processor (Intel Core i3 / AMD)", "Quad-core processor (Intel Core i5 / AMD Ryzen 5)"],
        ["RAM", "2 GB or higher", "4 GB DDR3/DDR4", "8 GB DDR4 or higher"],
        ["Storage", "100 MB free space for browser cache", "500 MB free disk space for project files", "2 GB SSD storage for database and logs"],
        ["Display", "5.0-inch mobile screen or 14-inch monitor", "1024 x 768 resolution display", "1920 x 1080 Full HD display"],
        ["Network", "2G/3G/4G/5G mobile data or Wi-Fi", "Local Area Network (LAN) or standard broadband", "Stable broadband connection (5 Mbps or higher)"]
    ]
}

CHAP5_SOFTWARE_PARAS = [
    "The software requirements encompass the operating system, development frameworks, database engines, programming libraries, and browser compatibility. The entire platform is built with open-source technologies, ensuring no licensing fees or dependency on proprietary platforms.",
    "Table 5.2 details the complete software environment used for developing and running the Smart Rural App."
]

CHAP5_SOFTWARE_TABLE = {
    "title": "Table 5.2: Software Technology Stack and Production Dependencies",
    "headers": ["Layer / Component", "Technology / Tool Used", "Version", "Purpose / Role"],
    "rows": [
        ["Operating System", "Microsoft Windows 10/11 / Linux (Ubuntu)", "64-bit OS", "Host operating system for running server and tools"],
        ["Runtime Environment", "Node.js with NPM", "v18.x or v20.x", "Asynchronous JavaScript server runtime environment"],
        ["Backend Framework", "Express.js", "v4.x", "Routing, HTTP request handling, session management"],
        ["Frontend Templating", "Embedded JavaScript (EJS)", "v3.x", "Dynamic HTML page rendering on the server side"],
        ["UI Styling & Framework", "Bootstrap 5 & Custom CSS", "v5.3", "Responsive mobile-friendly styling and UI components"],
        ["Database", "SQLite via sql.js", "v3.x", "Local ACID-compliant relational database for all records"],
        ["Machine Learning Runtime", "Python with Scikit-learn", "Python 3.10 / Scikit-learn 1.x", "Training and inference for Decision Tree and TF-IDF models"],
        ["SMS Gateway Service", "Fast2SMS REST API", "HTTP REST API", "Sending automated SMS payment reminders and alerts"],
        ["Code Editor / IDE", "Visual Studio Code (VS Code)", "Latest stable", "Source code development, testing, and debugging"],
        ["Web Browsers", "Google Chrome, Mozilla Firefox, Microsoft Edge", "Modern versions", "Client-side rendering and user interaction"]
    ]
}

CHAP5_FUNCTIONAL_REQS = [
    ("FR1: User Registration and Profile Management",
     "The system shall allow rural citizens to register by providing their full name, contact phone number, email address, property ID, annual income, farming status, and a secure password. The system shall validate inputs and prevent duplicate registrations."),
    ("FR2: Citizen and Administrator Authentication",
     "The system shall provide separate, secure login interfaces for citizens and Panchayat administrators, verifying credentials against stored records and maintaining active user sessions."),
    ("FR3: Property Tax Search and Details Retrieval",
     "The system shall allow citizens to search for their property records using their Property ID or Owner Name and view the property type, dimensions, ward location, annual assessed tax amount, payment status, and due year."),
    ("FR4: Online Simulated Payment and Receipt Generation",
     "The system shall provide a simulated payment interface where citizens can pay their outstanding property tax dues. Upon completing the simulated payment, the system shall immediately update the record status to 'Paid' in the database and generate a downloadable digital receipt containing a unique receipt number, payment date, and transaction summary."),
    ("FR5: Grievance Registration and Attachment Submission",
     "The system shall allow registered citizens to lodge public complaints regarding civic issues (such as water supply, roads, electricity, or sanitation) by providing a title, detailed description, ward location, and category."),
    ("FR6: Automated Complaint Categorization and Emergency Detection",
     "The system shall analyze submitted complaint descriptions using TF-IDF feature extraction and Logistic Regression to suggest the complaint category automatically, and check for emergency keywords to highlight critical issues for officials."),
    ("FR7: Public Grievance Status Tracking",
     "The system shall assign a unique complaint ID to each submitted grievance, allowing citizens to check the status (Pending, In Progress, or Resolved) and view administrative remarks at any time."),
    ("FR8: Government Welfare Schemes Catalog and Recommendation",
     "The system shall maintain an organized catalog of active government schemes with eligibility details and allow citizens to view schemes matching their demographic criteria (such as income, age, and occupation)."),
    ("FR9: GramMitra Bilingual Conversational Assistant",
     "The system shall provide an interactive chatbot capable of answering frequently asked questions in both English and Kannada regarding Panchayat timings, tax procedures, complaint lodging, and schemes using keyword and bigram matching."),
    ("FR10: Administrative Management and SMS Alerts",
     "The system shall provide administrators with dashboard views to monitor total tax collection, pending amounts, registered properties, and complaints. Officials can update property records, resolve complaints, inspect Decision Tree tax defaulter predictions, and send SMS reminders via Fast2SMS.")
]

CHAP5_NON_FUNCTIONAL_REQS = [
    ("NFR1: Usability and Simplicity",
     "The user interface must be clean, easy to navigate, and understandable for rural citizens with basic digital literacy. Text must be legible, forms should be simple, and buttons must be clearly labeled."),
    ("NFR2: Performance and Response Time",
     "Web pages must load within 2 seconds under standard local network conditions. Database queries for property lookup and complaint submission should execute in less than 200 milliseconds."),
    ("NFR3: Reliability and Data Consistency",
     "The SQLite database must maintain ACID properties so that tax status updates and payment records remain consistent and are not lost or corrupted during unexpected power failures."),
    ("NFR4: Security and Input Validation",
     "All user inputs must be sanitized using parameterized queries to protect against SQL injection vulnerabilities. Administrative pages must be restricted so that unauthorized users cannot modify data."),
    ("NFR5: Maintainability and Portability",
     "The application must be modular, separating frontend templates, backend routes, database helpers, and machine learning scripts. It must be portable across Windows and Linux operating systems without code modifications."),
    ("NFR6: Bilingual Availability",
     "The virtual assistant module must support both English and Kannada, allowing regional language speakers to interact comfortably with the system.")
]

CHAP6_TITLE = "CHAPTER 6\nIMPLEMENTATION"

CHAP6_INTRO = (
    "Implementation is the phase where the system design specifications are translated into functional software code. "
    "This chapter explains the runtime lifecycle of the Smart Rural App, details the frontend and backend implementations, "
    "describes database access using parameterized queries, outlines the working of each core functional module, "
    "and presents the machine learning pipeline used for tax prediction and complaint categorization."
)

CHAP6_RUNTIME_LIFECYCLE = [
    "The Smart Rural App runs as a Node.js web application managed through npm scripts. When the application starts (via 'npm start' or 'node server.js'), the server initializes the Express application, sets up middleware for parsing JSON and URL-encoded form data, and configures session handling.",
    "Next, the application connects to the SQLite database (data/panchayat.db) using the sql.js library. If the database file does not exist, an initialization script creates the required tables and seeds default administrative and sample records. The server then mounts the defined routes for authentication, tax management, complaints, schemes, chatbot queries, and administrative functions, and starts listening on the designated port (typically port 3000).",
    "When a user accesses the portal through a web browser, the server processes the HTTP request, executes any necessary database queries using prepared statements, combines the retrieved data with the appropriate EJS template, and returns a complete HTML page to the browser. Asynchronous operations—such as chatbot replies and simulated payment confirmation—are handled through REST API endpoints that return JSON responses."
]

CHAP6_FRONTEND_IMPL = [
    "The frontend is implemented using Embedded JavaScript (EJS) server-side templates styled with Bootstrap 5 and custom CSS stylesheets located in the 'public' directory. Server-side rendering was chosen because it delivers ready-to-display HTML to client browsers, minimizing JavaScript processing on low-powered mobile devices and older desktop computers.",
    "Key frontend components include:",
    "• Navigation Bar: A responsive navbar that provides quick links to Home, Tax Services, Complaints, Schemes, and Login/Register, adapting automatically to mobile and desktop screens.",
    "• Citizen Portal Views: Dedicated pages for citizen registration, login, property tax search with due balance calculation, a simulated payment modal dialog, a complaint submission form, and a schemes browser.",
    "• Admin Console Views: A comprehensive administrator dashboard displaying summary cards for total properties, tax revenue collected, pending arrears, and open complaints, along with data tables for updating records.",
    "• GramMitra Chat Widget: A floating chat window accessible from the bottom corner of every page, allowing users to type or select questions in English or Kannada and receive instant responses without leaving the current page."
]

CHAP6_BACKEND_IMPL = [
    "The backend is developed with Node.js and Express.js, structured across modular JavaScript files:",
    "• server.js: The main entry point that configures Express middleware, static file serving from the 'public' folder, session cookies, and route handlers.",
    "• database.js: Contains database helper functions using sql.js to execute parameterized SQL queries, read and write data to panchayat.db, and handle data persistence.",
    "• Authentication Middleware: Verifies user sessions and checks whether the logged-in user is a citizen or an administrator before granting access to protected routes.",
    "• Child-Process Execution: When machine learning model predictions are requested (such as retraining or running the Decision Tree classifier), the backend can invoke localized Python scripts using Node.js child_process.spawn or child_process.exec."
]

CHAP6_DATABASE_IMPL = [
    "The database is implemented using SQLite via the sql.js package. SQLite stores the entire relational database in a single file ('data/panchayat.db'). This approach offers significant practical advantages for rural local bodies: it requires zero external database server setup, consumes very little RAM, and ensures that the entire database can be easily backed up simply by copying the database file.",
    "The database schema consists of seven primary tables: users, admins, properties, tax_records, complaints, schemes, and sms_logs. All foreign key relationships are strictly maintained, ensuring that tax records and complaints reference valid properties and user profiles."
]

CHAP6_MODULES_IMPL = [
    {
        "num": "6.5.1",
        "title": "Module 1: Citizen and Administrator Authentication",
        "purpose": "Provides secure registration and role-based login for citizens and administrators.",
        "input": "User registration form (name, email, phone, password, property ID, income, farming status) or login credentials.",
        "processing": "The system validates the submitted fields, checks for existing accounts, hashes passwords, and creates an active session cookie upon successful verification.",
        "output": "Redirects the user to the Citizen Dashboard or the Admin Dashboard based on role.",
        "tech": "Node.js, Express session, HTML/EJS form handling.",
        "interaction": "Interacts with the 'users' and 'admins' tables in SQLite."
    },
    {
        "num": "6.5.2",
        "title": "Module 2: Tax Assessment and Defaulter Prediction",
        "purpose": "Allows citizens to check property tax details and enables officials to identify potential tax defaulters.",
        "input": "Property ID or Owner Name entered by the user.",
        "processing": "Retrieves matching property details and tax records from the database, calculates pending dues, and applies the trained Decision Tree model to assess defaulter risk based on past payment history.",
        "output": "Displays property details, assessed tax amount, due year, status, and prediction label.",
        "tech": "Express.js route, SQLite query, Scikit-learn Decision Tree classifier.",
        "interaction": "Reads from 'properties' and 'tax_records' tables."
    },
    {
        "num": "6.5.3",
        "title": "Module 3: Payment Processing and Receipt Generation",
        "purpose": "Enables citizens to complete simulated property tax payments online and download receipts, eliminating the need for physical cash payment visits to the office.",
        "input": "Property ID, tax amount, and simulated payment confirmation.",
        "processing": "Generates a unique transaction reference ID, updates the tax record status from 'Unpaid' to 'Paid' with the current timestamp in the database, and prepares payment receipt data.",
        "output": "Displays an instant confirmation and provides a downloadable payment receipt containing property details, amount paid, transaction ID, and date.",
        "tech": "JavaScript, EJS template, SQLite update query.",
        "interaction": "Updates the 'tax_records' table in the database."
    },
    {
        "num": "6.5.4",
        "title": "Module 4: Grievance Redressal and Priority Classification",
        "purpose": "Allows citizens to register civic complaints and helps administrators categorize and track them.",
        "input": "Complaint title, description, category, and ward selection.",
        "processing": "Saves the complaint in the database, applies TF-IDF and Logistic Regression to suggest the complaint category, checks description text for emergency keywords (e.g., 'wire', 'fire', 'burst', 'flood') to highlight urgent cases, and generates a tracking ID.",
        "output": "Complaint registration confirmation with tracking ID; visible on the citizen portal and admin complaint management table.",
        "tech": "Express.js route, TF-IDF Vectorizer, Logistic Regression, SQLite.",
        "interaction": "Writes to and reads from the 'complaints' table."
    },
    {
        "num": "6.5.5",
        "title": "Module 5: Welfare Scheme Recommendation",
        "purpose": "Presents available government welfare programs and matches them to citizen demographics.",
        "input": "Citizen profile attributes: age, annual income, land ownership, and farming status.",
        "processing": "Compares citizen demographic values against the eligibility rules of active government schemes stored in the database.",
        "output": "Displays a filtered list of eligible schemes with descriptions, benefits, and required application documents.",
        "tech": "JavaScript filtering logic, EJS cards, SQLite.",
        "interaction": "Reads from 'schemes' and 'users' tables."
    },
    {
        "num": "6.5.6",
        "title": "Module 6: Automated SMS Reminders and Gateway Console",
        "purpose": "Sends automated text alerts to citizens regarding due dates, pending tax amounts, and official notices.",
        "input": "Target phone number and text message content.",
        "processing": "Formats the request payload and makes an HTTPS POST call to the Fast2SMS API gateway. If external connectivity fails, it logs the message details locally in the database.",
        "output": "SMS delivered to the citizen's phone and logged in the admin SMS history table.",
        "tech": "Fast2SMS REST API, Node.js HTTPS module, SQLite.",
        "interaction": "Writes to the 'sms_logs' table."
    },
    {
        "num": "6.5.7",
        "title": "Module 7: Bilingual AI Virtual Assistant",
        "purpose": "Assists citizens by answering common questions regarding Panchayat operations in English and Kannada.",
        "input": "User query text entered in the chat window in English or Kannada.",
        "processing": "Cleans the query, applies spelling correction and bigram string matching against a structured knowledge base (faq_kb.json), and retrieves the most relevant answer. For tax or complaint inquiries, it can query the database directly.",
        "output": "Instant bilingual text response displayed in the chat interface.",
        "tech": "Python / JavaScript string matching, JSON knowledge base, EJS chat UI.",
        "interaction": "Reads from 'faq_kb.json' and queries 'panchayat.db'."
    }
]

CHAP6_QUERIES = [
    ("1. Retrieving Property and Tax Records Using Prepared Statements",
     "// Example query from database.js: Fetching property tax details safely\n"
     "function getPropertyTaxDetails(propertyId) {\n"
     "    const query = `\n"
     "        SELECT p.property_id, p.owner_name, p.property_type, p.ward, p.dimensions,\n"
     "               t.id AS tax_id, t.tax_amount, t.year, t.status, t.paid_date, t.receipt_no\n"
     "        FROM properties p\n"
     "        LEFT JOIN tax_records t ON p.property_id = t.property_id\n"
     "        WHERE p.property_id = ?\n"
     "        ORDER BY t.year DESC\n"
     "    `;\n"
     "    return db.exec(query, [propertyId]);\n"
     "}"),
    ("2. Inserting a New Citizen Complaint Safely",
     "// Example query: Registering a citizen grievance with parameterized inputs\n"
     "function insertComplaint(userId, description, category, priority, ward) {\n"
     "    const query = `\n"
     "        INSERT INTO complaints (user_id, description, category, priority, status, ward, created_at)\n"
     "        VALUES (?, ?, ?, ?, 'Pending', ?, datetime('now', 'localtime'))\n"
     "    `;\n"
     "    return db.run(query, [userId, description, category, priority, ward]);\n"
     "}"),
    ("3. Updating Tax Payment Record Upon Simulated Payment",
     "// Example query: Updating tax status to Paid and recording receipt number\n"
     "function updateTaxPayment(taxId, receiptNo) {\n"
     "    const query = `\n"
     "        UPDATE tax_records\n"
     "        SET status = 'Paid', paid_date = datetime('now', 'localtime'), receipt_no = ?\n"
     "        WHERE id = ?\n"
     "    `;\n"
     "    return db.run(query, [receiptNo, taxId]);\n"
     "}")
]

CHAP6_ML_PIPELINE = [
    ("1. Data Preparation and Feature Engineering",
     "Data for the machine learning models is gathered from the database and formatted Excel datasets. For tax defaulter prediction, features include property type (commercial vs. residential), assessed tax amount, past payment compliance ratio (ratio of paid taxes to total past assessments), and number of unpaid prior years. For complaints, raw complaint text is preprocessed by lowercasing, stripping punctuation, and removing common English stopwords."),
    ("2. Decision Tree Classifier for Tax Defaulter Risk",
     "A Decision Tree classifier is trained using Scikit-learn (DecisionTreeClassifier) to classify properties as either 'Defaulter' or 'Non-Defaulter'. Decision Trees were chosen because they provide clear, interpretable if-then decision rules, train rapidly on small to medium datasets, and run with negligible memory usage on standard office computers."),
    ("3. TF-IDF and Logistic Regression for Complaint Categorization",
     "For civic complaints, the text description is vectorized using Scikit-learn's TfidfVectorizer with unigrams and bigrams (ngram_range=(1,2)) to transform words into numeric feature weights. A multi-class Logistic Regression classifier is then trained to predict the complaint category (e.g., Water Supply, Electricity, Roads, Sanitation). In addition, a rule-based check scans for critical emergency terms to assist staff in prioritizing urgent issues."),
    ("4. Bilingual GramMitra Chatbot Engine",
     "The chatbot uses an offline-capable matching engine. User input is normalized and compared against questions in 'faq_kb.json' using word and character bigram similarity. If the similarity exceeds a defined threshold, the corresponding English or Kannada answer is returned. The engine also supports direct status checks for complaints and property taxes by querying the SQLite database.")
]
