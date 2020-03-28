const yaml = require('js-yaml');
const central = require('./central');
const config = require('./config');

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
async function loadYaml(yamlFile) {
  const yamlPath = path.join(
      process.env.GITHUB_WORKSPACE,
      yamlFile
  );

  const raw = fs.readFileSync(path, 'utf8');
  const doc = yaml.safeLoad(raw);

  return doc;
} 

/**
 * Process the files
 */
async function processFiles() {
  const files = config.files.filter(n => !n.startsWith('.'));

  const resources = files.map(n => loadYaml(n))
    .filter(d => d.kind && d.group && d.spec);

  console.log(JSON.stringify(resources, null, 4));

  central.processYaml(resources);  
}
