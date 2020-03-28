const yaml = require('js-yaml');
const fs   = require('fs');
const path = require('path');

// Load the yaml and convert to resource
async function loadYaml(yamlFile) {
    const yamlPath = path.join(
        process.env.GITHUB_WORKSPACE,
        yamlFile
    );

    const raw = fs.readFileSync(path, 'utf8');
    const doc = yaml.safeLoad(raw);

    console.log(doc);
    // TODO: Convert the doc to a resource
} 

module.exports = {
    loadYaml
}