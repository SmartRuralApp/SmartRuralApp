const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

  
  try {
    // Initialize database
    const dbInstance = await init();

    // Read Excel file
    const excelPath
