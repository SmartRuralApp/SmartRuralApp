const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const db = require('./database');


// Import Excel data
async function importExcelData() {
  console.log('🔄 Starting Excel import from SOFTWARE.xlsx...');
  
  try {
    // Read Excel file
    const excelPath = path.join(__dirname, 'SOFTWARE.xlsx');
    const workbook = XLSX.readFile(excelPath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON (first 1000 rows for testing)
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    console.log(`📊 Found ${data.length} rows in Excel`);
    
const dbPrepare = db.prepare;
    
    let imported = 0;
    let errors = 0;
    
    // Skip header row, process data rows
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      
      if (row.length < 3) continue; // Skip empty rows
      
      const propertyId = `PROP${String(i).padStart(4, '0')}`; // Generate unique ID
      const ownerName = row[0] || 'Unknown Owner';
      const phone = row[1] ? String(row[1]).replace(/[^0-9]/g, '') : null; // Clean phone
      const address = row[2] || '';
      
      try {
        // Insert property
        dbPrepare(`
          INSERT OR REPLACE INTO properties (property_id, owner_name, address, property_type)
          VALUES (?, ?, ?, 'Residential')
        `).run(propertyId, ownerName, address);
        
        // Insert user if phone exists
        if (phone && phone.length >= 10) {
          dbPrepare(`
            INSERT OR REPLACE INTO users (property_id, name, phone, password)
            VALUES (?, ?, ?, ?)
          `).run(propertyId, ownerName, phone, '123456'); // Default password
        }
        
        // Add sample tax record
        const taxAmount = Math.floor(Math.random() * 5000) + 1000;
        const dueDate = new Date(Date.now() + Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const year = new Date().getFullYear();
        
        dbPrepare(`
          INSERT INTO tax_records (property_id, tax_amount, due_date, year, status)
          VALUES (?, ?, ?, ?, ?)
        `).run(propertyId, taxAmount, dueDate, year, 'Unpaid');
        
        imported++;
        
        if (imported % 50 === 0) {
          console.log(`✅ Imported ${imported} records...`);
        }
      } catch (error) {
        console.error(`❌ Error importing row ${i}:`, error.message);
        errors++;
      }
    }
    
    console.log(`\n🎉 Import COMPLETE!`);
    console.log(`✅ Successfully imported: ${imported} properties/users`);
    console.log(`❌ Errors: ${errors}`);
    
    return { success: true, imported, errors };
    
  } catch (error) {
    console.error('💥 Excel import FAILED:', error.message);
    return { success: false, error: error.message };
  }
}

// Run import
if (require.main === module) {
  importExcelData().then(result => {
    console.log('Import finished:', result);
    process.exit(0);
  });
}

module.exports = { importExcelData };

