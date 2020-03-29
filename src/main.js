const yaml = require('js-yaml');
const central = require('./central');
const config = require('./config');
const fs   = require('fs');
const path = require('path');
const core = require('@actions/core');

async function run() {
  try {
    await processFiles();
    console.log("✅ Deploy Complete");
  }
  catch (error) {
    console.error("⚠️ Error deploying", error);
    core.setFailed(error.message);
  }
}

run();

// Load the yaml and convert to resource
function loadYaml(yamlFile) {
  const yamlPath = path.join(
      process.env.GITHUB_WORKSPACE,
      yamlFile
  );

  const raw = fs.readFileSync(yamlPath, 'utf8');
  const doc = yaml.safeLoad(raw);

  return doc;
} 

/**
 * Process the files
 */
async function processFiles() {
  const files = config.files.split(' ').filter(n => !n.startsWith('.'));
  console.log("FILES: ", files);

  const deleted = files.filter(f => !fs.existsSync(f));
  const modified = files.filter(f => !(deleted.indexOf(f)!==-1)).map(n => loadYaml(n))
    .filter(d => d.kind && d.group && d.spec);

  await central.process(deleted, modified);  
}
