const fs = require('fs');
const path = require('path');

const mapping = {
  "Houe en obsidienne": "primitif",
  "Marteau de pierre runique": "primitif",
  "Arc composite ancestral": "primitif",
  "Dague de jade": "primitif",
  "Fresque sur pierre": "primitif",
  "Statuette de déesse": "primitif",
  "Fondations d'un édifice massif": "primitif",
  "Portique de pierre": "primitif",
  "Calendrier astronomique": "primitif",
  "Stèle commémorative": "primitif",
  "Sceau de forage": "metal",
  "Ciseau de sculpteur": "metal",
  "Lame courbe gravée": "metal",
  "Bouclier de cérémonie": "metal",
  "Four de fusion": "metal",
  "Mosaïque de verre": "avance",
  "Parchemin enluminé": "avance",
  "Aqueduc souterrain": "avance",
  "Tour d'observation": "avance",
  "Étendard de guerre": "avance",
};

const filePath = path.join(__dirname, 'src/data/relicsPool.js');
let content = fs.readFileSync(filePath, 'utf8');

// For each mapping, find the block and add era property
Object.entries(mapping).forEach(([name, era]) => {
  // Pattern: lines from "  {" to "  }," with the name inside
  // We'll use a regex that matches the whole object block (simplistic)
  // Better to replace line containing domain and add era after.
  // We'll find the line with the name, then find the closing brace after that.
  // Since each block is small, we can do a simple regex per block.
  const regex = new RegExp(`(\\s*{\\s*\\n\\s*name: "${name}",\\s*\\n\\s*description: "[^"]+",\\s*\\n\\s*type: "[^"]+",\\s*\\n\\s*domain: "[^"]+"\\s*\\n\\s*})`, 'g');
  const replacement = `$1,\n    era: "${era}"`;
  content = content.replace(regex, replacement);
});

// Fix extra commas (the replacement may have added a comma before era line incorrectly)
// Actually we inserted a comma before era line, but we also need to add a comma after domain line.
// Let's do a more robust replacement: find each block and reconstruct.
// Instead, let's parse as JSON? Not possible.
// Let's do a simpler approach: add era line after domain line for each block.
// We'll split by lines and process.

const lines = content.split('\n');
let inBlock = false;
let blockStart = -1;
let blockName = null;
let newLines = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.trim().startsWith('name:') && line.includes('"')) {
    // extract name
    const match = line.match(/name:\s*"([^"]+)"/);
    if (match) {
      blockName = match[1];
    }
  }
  if (line.trim().startsWith('domain:')) {
    // This is the last property before closing brace (except maybe trailing comma)
    // Add a comma after this line
    newLines.push(line + ',');
    // Add era line
    const era = mapping[blockName] || 'primitif';
    const indent = line.match(/^(\s*)/)[1];
    newLines.push(`${indent}era: "${era}"`);
    blockName = null;
  } else {
    newLines.push(line);
  }
}

const newContent = newLines.join('\n');
fs.writeFileSync(filePath, newContent, 'utf8');
console.log('Updated relicsPool.js');