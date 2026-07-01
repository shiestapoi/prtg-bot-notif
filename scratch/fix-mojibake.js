const fs = require('fs');
const path = require('path');

const replacements = {
  'ðŸ”§': '🔧',
  'â€”': '—',
  'ðŸ“ ': '📌',
  'ðŸ ¢': '🏢',
  'ðŸ“Š': '📊',
  'ðŸ“¥': '📥',
  'ðŸ“¤': '📤',
  'ðŸ’¬': '💬',
  'â °': '⏰',
  'âš ï¸ ': '⚠️',
  'â” ': '━'
};

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.ts')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk(path.join(__dirname, '..', 'src'));
let totalChanged = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;

  for (const [bad, good] of Object.entries(replacements)) {
    // Escape bad characters for regex
    // wait, we can just use string replaceAll
    if (content.includes(bad)) {
      content = content.split(bad).join(good);
    }
  }

  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Fixed mojibake in ${file}`);
    totalChanged++;
  }
}

console.log(`Total files fixed: ${totalChanged}`);
