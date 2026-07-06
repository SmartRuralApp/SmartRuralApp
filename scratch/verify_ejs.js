const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

const viewsDir = path.join(__dirname, '..', 'views');
const files = fs.readdirSync(viewsDir).filter(f => f.endsWith('.ejs'));

let errors = 0;
files.forEach(file => {
  const filePath = path.join(viewsDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  try {
    // EJS compile check
    ejs.compile(content, { filename: filePath });
    console.log(`✓ Compile Success: ${file}`);
  } catch (error) {
    console.error(`✗ Compile Error in ${file}:`, error.message);
    errors++;
  }
});

if (errors > 0) {
  console.error(`EJS compile test failed with ${errors} error(s).`);
  process.exit(1);
} else {
  console.log('All EJS views compiled successfully!');
  process.exit(0);
}
