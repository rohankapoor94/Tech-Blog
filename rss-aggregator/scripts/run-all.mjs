import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runScript(scriptName) {
  return new Promise((resolve) => {
    console.log(`\n========================================`);
    console.log(`Starting ${scriptName}...`);
    console.log(`========================================`);
    const child = spawn('node', [path.join(__dirname, scriptName)], {
      stdio: 'inherit'
    });

    child.on('close', (code) => {
      if (code !== 0) {
        console.error(`❌ ${scriptName} failed with exit code ${code}`);
      } else {
        console.log(`✅ ${scriptName} completed successfully`);
      }
      resolve(code);
    });
  });
}

async function main() {
  // Find all ingest scripts (ingest.mjs, ingest-coinbase.mjs, etc.)
  const scripts = fs.readdirSync(__dirname)
    .filter(f => f.startsWith('ingest') && f.endsWith('.mjs') && f !== 'run-all.mjs');
  
  let hasError = false;
  for (const script of scripts) {
    const code = await runScript(script);
    if (code !== 0) {
      hasError = true;
    }
  }
  
  if (hasError) {
    console.error("\n❌ One or more ingestion scripts failed. See logs above.");
    // Exit with 1 so GitHub Actions still flags the run as failed for visibility
    process.exit(1);
  } else {
    console.log("\n🎉 All ingestion scripts completed successfully!");
  }
}

main();
