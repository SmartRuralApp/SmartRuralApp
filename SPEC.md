# Smart Grama Panchayat Management System - Specification

## Project Overview
- **Project Name**: Smart Grama Panchayat Management System
- **Type**: Web Application
- **Core Functionality**: A comprehensive platform to digitize Panchayat services enabling citizens to view tax details, make payments, and access services information. Administrators can manage records efficiently.
- **Target Users**: Rural citizens and Panchayat administrators

## Technology Stack
- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Backend**: Node.js with Express.js
- **Database**: SQLite with better-sqlite3
- **Template Engine**: EJS

## UI/UX Specification

### Layout Structure
- **Header**: Logo, Navigation (Home, Tax Payment, Services, Admin Login)
- **Hero Section**: Welcome message with quick access buttons
- **Content Areas**: Dynamic content based on navigation
- **Footer**: Copyright, contact info, quick links

### Responsive Breakpoints
- Mobile: < 768px
- Tablet: 768px - 1024px
- Desktop: > 1024px

### Visual Design

#### Color Palette
- **Primary**: #2E7D32 (Forest Green - represents rural/grass)
- **Secondary**: #1565C0 (Government Blue)
- **Accent**: #FF8F00 (Amber - for CTAs and highlights)
- **Background**: #F5F5F5 (Light Gray)
- **Card Background**: #FFFFFF
- **Text Primary**: #212121
- **Text Secondary**: #757575
- **Success**: #43A047
- **Warning**: #FFA000
- **Error**: #E53935

#### Typography
- **Font Family**: 'Poppins' for headings, 'Open Sans' for body
- **Headings**: 
  - H1: 2.5rem, weight 700
  - H2: 2rem, weight 600
  - H3: 1.5rem, weight 600
- **Body**: 1rem, weight 400
- **Small**: 0.875rem

#### Spacing System
- Base unit: 8px
- Margins: 8px, 16px, 24px, 32px, 48px
- Paddings: 8px, 16px, 24px, 32px
- Card border-radius: 12px
- Button border-radius: 8px

#### Visual Effects
- Card shadows: 0 4px 12px rgba(0,0,0,0.1)
- Hover transitions: 0.3s ease
- Button hover: scale(1.02) with shadow increase
- Form focus: 3px solid primary color with 0.2 opacity

### Components

#### Navigation Bar
- Fixed top position
- Logo on left
- Menu items on right
- Mobile hamburger menu
- Active state: underline with primary color

#### Search Component
- Large search input with icon
- Search by Property ID or Owner Name
- Placeholder text with instructions

#### Tax Details Card
- Property ID, Owner Name, Tax Amount
- Due Date with countdown
- Payment Status badge (Paid/Unpaid/Overdue)
- Pay Now button for unpaid taxes

#### Payment Modal
- Payment amount display
- Payment method selection (simulated)
- Confirm/Cancel buttons
- Success animation

#### Admin Dashboard Cards
- Total collection stats
- Pending payments count
- Recent transactions table
- Add/Edit forms for records

#### Service Cards
- Service icon
- Service title
- Description
- Status badge

## Database Schema

### Tables

#### properties
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PRIMARY KEY | Auto-increment |
| property_id | TEXT UNIQUE | Unique property identifier |
| owner_name | TEXT | Property owner name |
| address | TEXT | Property address |
| property_type | TEXT | Residential/Commercial |
| created_at | DATETIME | Record creation date |

#### tax_records
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PRIMARY KEY | Auto-increment |
| property_id | TEXT | Foreign key to properties |
| tax_amount | REAL | Tax amount |
| due_date | DATE | Tax due date |
| year | INTEGER | Tax year |
| status | TEXT | Paid/Unpaid/Overdue |
| created_at | DATETIME | Record creation date |

#### payments
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PRIMARY KEY | Auto-increment |
| property_id | TEXT | Foreign key to properties |
| tax_record_id | INTEGER | Foreign key to tax_records |
| amount | REAL | Payment amount |
| payment_date | DATETIME | Payment date |
| payment_method | TEXT | Payment method |
| transaction_id | TEXT | Unique transaction ID |

#### services
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PRIMARY KEY | Auto-increment |
| title | TEXT | Service name |
| description | TEXT | Service description |
| icon | TEXT | Icon class |
| status | TEXT | Active/Inactive |
| created_at | DATETIME | Record creation date |

#### reminders
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PRIMARY KEY | Auto-increment |
| property_id | TEXT | Foreign key to properties |
| tax_record_id | INTEGER | Foreign key to tax_records |
| reminder_date | DATE | When reminder sent |
| sent | INTEGER | 0/1 sent status |

## Functionality Specification

### Citizen Features

#### 1. Tax Search & View
- Enter Property ID or Owner Name in search box
- Display matching tax records
- Show property details, tax amount, due date
- Color-coded status badges
- Link to payment if unpaid

#### 2. Tax Payment
- Click "Pay Now" on unpaid taxes
- Payment modal opens with amount
- Simulate payment process
- Update tax record status to "Paid"
- Generate transaction receipt

#### 3. Automated Reminders
- Check tax records daily
- Identify taxes due within 7 days
- Store reminder records
- Display reminder notification on citizen portal

#### 4. Services Information
- View all Panchayat services
- Filter by active/inactive
- Read service descriptions

### Admin Features

#### 1. Admin Login
- Username/password authentication
- Session management
- Protected routes

#### 2. Tax Management
- Add new tax records
- Edit existing records
- Delete records
- View all records with filters

#### 3. Payment Monitoring
- View all payments
- Filter by date range
- Export functionality (display only)

#### 4. Service Management
- Add new services
- Edit existing services
- Toggle service status
- Delete services

## Pages Structure

### Public Pages
1. **index.html** - Home/Landing page
2. **tax-search.html** - Tax search and payment
3. **services.html** - Services information
4. **payment-success.html** - Payment confirmation

### Admin Pages
1. **admin-login.html** - Admin login
2. **admin-dashboard.html** - Main admin dashboard
3. **admin-tax.html** - Tax records management
4. **admin-services.html** - Services management

## Acceptance Criteria

### Visual Checkpoints
- [ ] Header displays correctly with navigation
- [ ] Color scheme matches specification
- [ ] Typography is consistent
- [ ] Cards have proper shadows and borders
- [ ] Responsive design works on all breakpoints
- [ ] Animations are smooth

### Functional Checkpoints
- [ ] Tax search returns correct results
- [ ] Payment process completes successfully
- [ ] Admin login works with credentials
- [ ] CRUD operations for tax records work
- [ ] Service management functions properly
- [ ] Database operations persist data

### Sample Data
- Admin credentials: admin/admin123
- 5 sample properties with tax records
- 5 sample services

## File Structure
```
c:/Project/
├── package.json
├── server.js
├── database.js
├── public/
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   └── main.js
│   └── images/
├── views/
│   ├── index.ejs
│   ├── tax-search.ejs
│   ├── services.ejs
│   ├── admin-login.ejs
│   ├── admin-dashboard.ejs
│   ├── admin-tax.ejs
│   └── admin-services.ejs
└── data/
    └── pancahyat.db
```

