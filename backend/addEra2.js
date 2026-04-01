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
let lines = fs.readFileSync(filePath, 'utf8').split('\n');

let output = [];
let i = 0;
while (i < lines.length) {
  const line = lines[i];
  output.push(line);
  // Check if this line is a domain line inside a relic block
  if (line.trim().startsWith('domain:')) {
    // Look backwards for the name line within the same block (should be within a few lines)
    let name = null;
    for (let j = i - 1; j >= 0 && !lines[j].trim().startsWith('{'); j--) {
      const nameMatch = lines[j].match(/^\s*name:\s*"([^"]+)"/);
      if (nameMatch) {
        name = nameMatch[1];
        break;
      }
    }
    if (name && mapping[name]) {
      // Add comma to domain line if not present
      if (!line.trim().endsWith(',')) {
        output[output.length - 1] = line.replace(/\s*$/, '') + ',';
      }
      // Insert era line with same indentation
      const indent = line.match(/^(\s*)/)[1];
      const era = mapping[name];
      output.push(`${indent}era: "${era}"`);
    }
  }
  i++;
}

fs.writeFileSync(filePath, output.join('\n'), 'utf8');
console.log('Added era fields successfully.');