const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Read the Excel file
const filePath = path.join(__dirname, 'SOFTWARE.xlsx');
const workbook = XLSX.readFile(filePath);

// Get first sheet
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

// Get range
console.log('Sheet range:', sheet['!ref']);

// Let's look at raw cell data - examine cells in first 20 rows
console.log('\nRaw cell examination:');
const range = XLSX.utils.decode_range(sheet['!ref']);
for (let R = 0; R < 20; R++) {
  const rowData = [];
  for (let C = 0; C < 15; C++) {
    const cellAddress = XLSX.utils.encode_cell({r: R, c: C});
    const cell = sheet[cellAddress];
    if (cell && cell.v !== undefined) {
      rowData.push(C + ':' + cell.v);
    }
  }
  if (rowData.length > 0) {
    console.log('Row ' + R + ':', rowData.join(' | '));
  }
}

// Also check if there's more data in other columns
console.log('\n\nMax column:', range.e.c + 1);
console.log('Max row:', range.e.r + 1);

