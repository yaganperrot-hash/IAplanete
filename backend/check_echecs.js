require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { db } = require('./src/config/db');

const rows = db.prepare('SELECT id, nom, last_echecs FROM civilizations').all();
console.log('Total civilizations:', rows.length);
rows.forEach(row => {
  console.log(`Civ ${row.id} "${row.nom}": last_echecs = ${row.last_echecs}`);
});