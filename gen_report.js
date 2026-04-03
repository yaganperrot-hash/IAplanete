const { generateFinalReport } = require('./backend/scripts/nightMonitor.js');
generateFinalReport().then(() => { console.log('OK'); process.exit(0); }).catch(e => { console.error(e.message); process.exit(1); });
