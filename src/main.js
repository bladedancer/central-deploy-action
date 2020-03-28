const yaml = require('js-yaml');
const central = require('./central');
const core = require('@actions/core');

async function run() {
  const inputs = getUserArguments();

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


function getUserArguments() {
  return {
    files: core.getInput('files', { required: true }),
    kid: core.getInput('kid', { required: true }),
    alg: withDefault(core.getInput('alg', { required: false }), 'RS256'),
    iss: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer:' + core.getInput('sub', { required: true }),
    aud: withDefault(core.getInput('aud', { required: false }), 'https://login.axway.com/auth/realms/Broker'),
    sub: core.getInput('sub', { required: true }),
    privateKey: core.getInput('privateKey', { required: true })
  };
}

function withDefault(value, defaultValue) {
  if (value === '' || value === null || value === undefined) {
    return defaultValue;
  }
  return value;
}

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
async function processFiles(inputs) {
  const files = inputs.files.filter(n => !n.startsWith('.'));

  const resources = files.map(n => loadYaml(n))
    .filter(d => d.kind && d.group && d.spec);

  console.log(JSON.stringify(resources, null, 4));

  central.processYaml(resources);  
}
