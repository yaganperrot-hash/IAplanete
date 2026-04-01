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

let i = 0;
let output = [];
while (i < lines.length) {
  const line = lines[i];
  output.push(line);
  // Check if line contains a relic name we care about
  const nameMatch = line.match(/^\s*name:\s*"([^"]+)"/);
  if (nameMatch && mapping[nameMatch[1]]) {
    // This is a relic block start. We'll need to find the domain line within the same block.
    // Since blocks are small, we can scan forward until we find the closing brace.
    let j = i + 1;
    let domainLineIndex = -1;
    while (j < lines.length && !lines[j].trim().startsWith('}')) {
      if (lines[j].trim().startsWith('domain:')) {
        domainLineIndex = j;
      }
      j++;
    }
    if (domainLineIndex !== -1) {
      // Replace domain line with same line plus comma
      const domainLine = lines[domainLineIndex];
      // Ensure there is no trailing comma already
      const newDomainLine = domainLine.replace(/\s*$/, '') + ',';
      // Insert era line after domain line
      const indent = domainLine.match(/^(\s*)/)[1];
      const era = mapping[nameMatch[1]];
      const eraLine = `${indent}era: "${era}"`;
      // We need to modify the output accordingly.
      // Since we have already added lines up to current line, we need to adjust.
      // Let's backtrack: we have already added line i (the name line).
      // We'll remove the lines we added after i and re-add with modifications.
      // Simpler: we can process block by block and replace the whole block.
      // Let's do a different approach: parse block and regenerate.
      // For simplicity, let's just do a second pass.
    }
  }
  i++;
}

// Second pass: reconstruct file by blocks using regex.
let content = lines.join('\n');
// Use a regex to match each object block (from "  {" to "  },")
const blockRegex = /(\s*{\s*\n(?:\s*[a-z]+:\s*"[^"]*",?\s*\n)+?\s*})/g;
let newContent = content.replace(blockRegex, (block) => {
  // Extract name
  const nameMatch = block.match(/name:\s*"([^"]+)"/);
  if (!nameMatch) return block;
  const name = nameMatch[1];
  const era = mapping[name];
  if (!era) return block;
  // Insert era after domain line
  // Find the line that contains domain:
  const lines = block.split('\n');
  let newLines = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    newLines.push(line);
    if (line.trim().startsWith('domain:')) {
      // Add comma if missing
      if (!line.trim().endsWith(',')) {
        newLines[i] = line + ',';
      }
      // Add era line
      const indent = line.match(/^(\s*)/)[1];
      newLines.push(`${indent}era: "${era}"`);
    }
  }
  return newLines.join('\n');
});

fs.writeFileSync(filePath, newContent, 'utf8');
console.log('Added era fields.');