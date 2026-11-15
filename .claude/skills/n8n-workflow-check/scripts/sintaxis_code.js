// Compile each Code node without executing it, using the async function wrapper used by n8n.
// stdin: [[nombreNodo, jsCode], ...]. Output: [{nodo, error}] for failing nodes only.
const vm = require('vm');
let datos = '';
process.stdin.on('data', (c) => (datos += c));
process.stdin.on('end', () => {
  const fallos = [];
  for (const [nodo, code] of JSON.parse(datos)) {
    try {
      new vm.Script('(async function () {\n' + code + '\n})', { filename: nodo });
    } catch (e) {
      const linea = (e.stack || '').split('\n')[0].match(/:(\d+)$/);
      fallos.push({ nodo, error: e.message + (linea ? ` (near line ${Math.min(Number(linea[1]) - 1, code.split('\n').length)})` : '') });
    }
  }
  process.stdout.write(JSON.stringify(fallos));
});
