const access = require("./access");
const config = require("./config");
const walk = require("fs-walk");
const yaml = require("js-yaml");

// TODO: Should string together order dynamically from defs.
const ORDER = [
  "Gateway",
  "Stage",
  "Environment",
  "APIService",
  "APIServiceRevision",
  "APIServiceInstance",
  "VirtualAPI",
  "VirtualAPIDefinition",
  "PathRoute",
  "Rules",
  "Deployment"
];

// Load the yaml and convert to resource
function loadYaml(yamlFile) {
  const raw = fs.readFileSync(yamlFile, "utf8");
  const doc = yaml.safeLoad(raw);
  return doc;
}

// For simplicity going to load the entire project and diff it.
// It's the easiest way to find deletions and multiple resources per file.
function loadProject() {
  const yamls = [];
  return new Promise((resolve, reject) => {
    console.log("fido", process.env.GITHUB_WORKSPACE)
    walk.files(process.env.GITHUB_WORKSPACE, 
      (basedir, filename, stat, next) => {
        console.log(filename);
        yamls.push(loadYaml(path.join(basedir, filename)));
        next();
      }, 
      (err) => {
        if (err) {
          return reject(err);
        }
        resolve(yamls);
      });
    });
}


// Load the yaml and convert to resource
async function processProject() {
  //await access.getAccessToken();
  try {
    const yamls = await loadProject();
    console.log(yamls);
  } catch (err) {
    console.error(err);
    throw err;
  }
}

module.exports = {
  process: processProject
};
