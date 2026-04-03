require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { db } = require('./src/config/db');

const rows = db.prepare('SELECT * FROM unknown_actions').all();
console.log('Unknown actions count:', rows.length);
rows.forEach((row, i) => {
  console.log(`Row ${i}: action_type="${row.action_type}", timestamp="${row.timestamp}"`);
});