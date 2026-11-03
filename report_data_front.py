# report_data_front.py
# Contains front matter definitions, certificates, declarations, acknowledgments, abstract,
# and abbreviations for the Smart Rural App Major Project Report.

TITLE = "SMART RURAL APP – SMART GRAM PANCHAYAT SYSTEM"
SUBTITLE = "AI-Powered Smart Digital Governance System for Rural Community"
DEGREE = "BACHELOR OF ENGINEERING"
BRANCH = "ARTIFICIAL INTELLIGENCE AND DATA SCIENCE"
UNIVERSITY = "VISVESVARAYA TECHNOLOGICAL UNIVERSITY"
UNIVERSITY_ADDRESS = "Jnana Sangama, Belagavi – 590018, Karnataka, India"
COLLEGE = "A. J. INSTITUTE OF ENGINEERING AND TECHNOLOGY"
COLLEGE_SUB = "A Unit of Laxmi Memorial Education Trust ®"
COLLEGE_APPROVAL = "(Approved by AICTE, New Delhi, Affiliated to VTU, Belagavi, Recognized by Govt. of Karnataka)\nAccredited by NAAC & NBA (BE: CV, CSE, ECE, ISE, ME)\nNH-66, Kottara Chowki, Mangaluru – 575006, Karnataka"
ACADEMIC_YEAR = "2025–2026"

STUDENTS = [
    {"name": "RUBY KUMARI KADKHA", "usn": "4JK23AD042"},
    {"name": "SAKSHI", "usn": "4JK23AD044"},
    {"name": "SUDEEPTHI", "usn": "4JK23AD056"},
    {"name": "THRISHA", "usn": "4JK23AD057"}
]

GUIDE_NAME = "Dr. Padmanayana"
GUIDE_DESIGNATION = "Associate Professor and Head of the Department"
DEPARTMENT = "DEPARTMENT OF ARTIFICIAL INTELLIGENCE & DATA SCIENCE"

PRINCIPAL_NAME = "Dr. P. Mahabaleshwarappa"
PRINCIPAL_DESIGNATION = "Principal In-Charge"

CAMPUS_DIRECTOR = "Dr. T. Jayaprakash Rao"
PRESIDENT_NAME = "Dr. A. J. Shetty"
VP_NAME = "Mr. Prashanth Shetty"

DEPT_CERTIFICATE_TEXT = (
    "This is to certify that the major project report entitled \"Smart Rural App – Smart Gram Panchayat System\" "
    "(AI-Powered Smart Digital Governance System for Rural Community) is a bonafide record of project work "
    "carried out by RUBY KUMARI KADKHA (USN: 4JK23AD042), SAKSHI (USN: 4JK23AD044), SUDEEPTHI (USN: 4JK23AD056), "
    "and THRISHA (USN: 4JK23AD057), in partial fulfillment for the award of Bachelor of Engineering in "
    "Artificial Intelligence and Data Science of the Visvesvaraya Technological University, Belagavi during the academic year 2025–2026. "
    "The contents of this report, in full or in parts, have not been submitted to any other Institution or University for the award of any degree."
)

COLLEGE_CERTIFICATE_TEXT = (
    "Certified that the project work entitled \"Smart Rural App – Smart Gram Panchayat System\" was successfully "
    "carried out by Ms. Ruby Kumari Kadkha (4JK23AD042), Ms. Sakshi (4JK23AD044), Ms. Sudeepthi (4JK23AD056), and "
    "Ms. Thrisha (4JK23AD057), bonafide students of A. J. Institute of Engineering and Technology, Mangaluru, in partial fulfillment "
    "for the award of Bachelor of Engineering in Artificial Intelligence and Data Science of the Visvesvaraya Technological University, "
    "Belagavi during the year 2025–2026. It is certified that all corrections/suggestions indicated for the Internal Assessment "
    "have been incorporated in the Report deposited in the departmental library. The project report has been approved as it satisfies "
    "the academic requirements in respect of Project Work prescribed for the said Degree."
)

DECLARATION_TEXT = (
    "We declare that this project report titled \"Smart Rural App – Smart Gram Panchayat System\" submitted in partial fulfillment "
    "of the degree of Bachelor of Engineering in Artificial Intelligence & Data Science is an authentic record of original work "
    "carried out by us under the supervision and guidance of Dr. Padmanayana, Associate Professor and Head of the Department of "
    "Artificial Intelligence and Data Science, A. J. Institute of Engineering and Technology, Mangaluru. This work has not formed the basis "
    "for the award of any other degree, diploma, associate-ship, or fellowship in this or any other Institution or University. "
    "In keeping with standard ethical practices in reporting scientific and engineering findings, due acknowledgments have been made "
    "wherever the contributions, ideas, and publications of others have been cited."
)

ACKNOWLEDGMENTS_TEXT = [
    "The successful completion of this major project marks an important milestone in our academic journey. We take this opportunity to express our sincere gratitude to everyone who supported and guided us throughout this project.",
    "First and foremost, we express our deep sense of gratitude to our respected President, Dr. A. J. Shetty, and our respected Vice President, Mr. Prashanth Shetty, for their visionary leadership and for providing excellent laboratory infrastructure and facilities at A. J. Institute of Engineering and Technology.",
    "We express our sincere thanks to Dr. T. Jayaprakash Rao, Campus Director, for his continuous encouragement and academic support throughout our course of study.",
    "We are extremely grateful to our respected Principal In-Charge, Dr. P. Mahabaleshwarappa, for his administrative support, guidance, and encouragement during the project work.",
    "We convey our deepest gratitude and special thanks to our project guide and Head of the Department, Dr. Padmanayana, Department of Artificial Intelligence & Data Science, for her constant guidance, constructive suggestions, and supervision throughout the design, implementation, and report preparation.",
    "We also extend our sincere appreciation to all the faculty members and staff of the Department of Artificial Intelligence & Data Science for their cooperation and technical assistance during our laboratory work.",
    "Finally, we express our heartfelt thanks to our parents and family members for their continuous support and encouragement. We also thank our classmates and friends who helped us directly and indirectly in completing this project successfully."
]

ABSTRACT_TEXT = (
    "Gram Panchayats are the foundation of rural local governance in India, serving millions of citizens across village communities. In most Gram Panchayats, daily administrative operations are still carried out using physical paper registers. These include managing property tax records, registering citizen complaints, tracking government welfare schemes, and issuing notices. Maintaining paper records leads to many problems such as damaged files, missing records, delayed grievance redressal, and poor tax collection. In addition, rural citizens often face difficulties because they have to visit the Panchayat office repeatedly, travel long distances, and wait in queues just to check their tax dues or lodge a complaint.\n\n"
    "To address these issues, we designed and developed the \"Smart Rural App – Smart Gram Panchayat System\". It is an integrated, web-based digital governance platform built using Node.js, Express.js, EJS templating, and an SQLite database managed with sql.js. The platform provides separate portals for citizens and administrative officials. Citizens can register and log in, view their property details, check pending tax amounts, make simulated digital payments, download payment receipts, register public complaints, check eligible welfare schemes, and chat with an interactive virtual assistant. Panchayat administrators have access to an admin dashboard to manage property records, verify tax payments, track and update complaint statuses, and review citizen details.\n\n"
    "The system also integrates machine learning techniques to support administrative decision-making. A Decision Tree classifier is implemented using Scikit-learn to analyze property and tax payment history to predict potential tax defaulters, helping officials take timely follow-up actions. For civic grievances, a text classification pipeline using Term Frequency-Inverse Document Frequency (TF-IDF) feature extraction and Logistic Regression is used to categorize complaints and assist officials in prioritizing urgent issues. To help rural citizens overcome language barriers, the system features \"GramMitra\", an offline-capable bilingual chatbot in English and Kannada that answers common questions using keyword matching against a structured knowledge base. Furthermore, SMS notifications are integrated using the Fast2SMS API to send tax payment alerts and status updates. The completed project was tested locally and demonstrated that digitizing Panchayat operations significantly improves administrative efficiency, transparency, and accessibility for rural citizens."
)

ABBREVIATIONS = [
    ("AI", "Artificial Intelligence"),
    ("AJIET", "A. J. Institute of Engineering and Technology"),
    ("API", "Application Programming Interface"),
    ("CSS", "Cascading Style Sheets"),
    ("CSV", "Comma-Separated Values"),
    ("DCB", "Demand, Collection, and Balance"),
    ("DFD", "Data Flow Diagram"),
    ("EJS", "Embedded JavaScript Templating"),
    ("ER", "Entity Relationship"),
    ("FAQ", "Frequently Asked Questions"),
    ("HTML", "HyperText Markup Language"),
    ("HTTP", "Hypertext Transfer Protocol"),
    ("IDE", "Integrated Development Environment"),
    ("IEEE", "Institute of Electrical and Electronics Engineers"),
    ("JSON", "JavaScript Object Notation"),
    ("KPI", "Key Performance Indicator"),
    ("ML", "Machine Learning"),
    ("NLP", "Natural Language Processing"),
    ("NPM", "Node Package Manager"),
    ("OS", "Operating System"),
    ("PC", "Personal Computer"),
    ("PDO", "Panchayat Development Officer"),
    ("RAM", "Random Access Memory"),
    ("RBAC", "Role-Based Access Control"),
    ("REST", "Representational State Transfer"),
    ("SMS", "Short Message Service"),
    ("SQL", "Structured Query Language"),
    ("TF-IDF", "Term Frequency – Inverse Document Frequency"),
    ("UI", "User Interface"),
    ("UML", "Unified Modeling Language"),
    ("URL", "Uniform Resource Locator"),
    ("USN", "University Seat Number"),
    ("VTU", "Visvesvaraya Technological University")
]
