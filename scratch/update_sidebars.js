const fs = require('fs');
const path = require('path');

const viewsDir = path.join(__dirname, '..', 'views');
const files = fs.readdirSync(viewsDir).filter(f => f.startsWith('admin-') && f.endsWith('.ejs'));

const getMenu = (activeFile) => {
  const active = (name) => activeFile === `admin-${name}.ejs` ? ' class="sidebar-link active"' : ' class="sidebar-link"';
  const activeClassOnly = (name) => activeFile === `admin-${name}.ejs` ? ' class="active"' : '';
  
  // Note: some layouts use class="active" directly or with sidebar-link
  return `      <ul class="sidebar-menu">
        <li><a href="/admin-dashboard"${activeClassOnly('dashboard')}><i class="fas fa-tachometer-alt"></i> Dashboard</a></li>
        <li><a href="/admin-properties"${activeClassOnly('properties')}><i class="fas fa-city"></i> Properties</a></li>
        <li><a href="/admin-citizens"${activeClassOnly('citizens')}><i class="fas fa-users"></i> Citizens</a></li>
        <li><a href="/admin-tax"${activeClassOnly('tax')}><i class="fas fa-receipt"></i> Tax Management</a></li>
        <li><a href="/admin-reminders"${activeClassOnly('reminders')}><i class="fas fa-bell"></i> SMS Reminders</a></li>
        <li><a href="/admin-appointments"${activeClassOnly('appointments')}><i class="fas fa-calendar-check"></i> Appointments</a></li>
        <li><a href="/admin-complaints"${activeClassOnly('complaints')}><i class="fas fa-exclamation-triangle"></i> Complaints</a></li>
        <li><a href="/admin-services"${activeClassOnly('services')}><i class="fas fa-cogs"></i> Services</a></li>
        <li><a href="/admin-schemes"${activeClassOnly('schemes')}><i class="fas fa-hand-holding-usd"></i> Schemes</a></li>
        <li><a href="/admin-ml-performance"${activeClassOnly('ml-performance')}><i class="fas fa-chart-line"></i> ML Performance</a></li>
        <li><a href="/admin-logout"><i class="fas fa-sign-out-alt"></i> Logout</a></li>
      </ul>`;
};

files.forEach(file => {
  const filePath = path.join(viewsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  const regex = /<ul class="sidebar-menu">[\s\S]*?<\/ul>/;
  if (regex.test(content)) {
    content = content.replace(regex, getMenu(file));
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated sidebar in ${file}`);
  } else {
    console.log(`No sidebar found in ${file}`);
  }
});
console.log('Sidebar synchronization completed successfully!');
