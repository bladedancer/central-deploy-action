const access = require('./access');
const config = require('./config');
const yaml = require('js-yaml');
const axios = require('axios');
const fs = require('fs');
const { getYaml } = require('./utils');


// TODO: Should string together order dynamically from defs.
const RESOURCES = {
  'Gateway' : {
    plural: 'gateways'
  },
  'Stage': {
    scope: 'Gateway',
    plural: 'stages'
  },
  'Policy': {
    scope: 'Gateway',
    plural: 'policies'
  },
  'Environment': {
    plural: 'environments'
  },
  'APIService': {
    scope: 'Environment',
    plural: 'apiservices'
  },
  'APIServiceRevision': {
    scope: 'Environment',
    plural: 'apiservicerevisions'
  },
  'APIServiceInstance': {
    scope: 'Environment',
    plural: 'apiserviceinstances'
  },
  'ConsumerInstance': {
    scope: 'Environment',
    plural: 'consumerinstances'
  },
  'VirtualAPI': {
    scope: 'Environment',
    plural: 'virtualapis'
  },
  'VirtualAPIDefinition': {
    scope: 'Environment',
    plural: 'virtualapidefinitions'
  },
  'PathRoute': {
    scope: 'Environment',
    plural: 'pathroutes'
  },
  'Rules': {
    scope: 'Environment',
    plural: 'rules'
  },
  'Deployment': {
    scope: 'Environment',
    plural: 'deplotments'
  }
};

let accessToken;

function mapByPath(projectList) {
  // Map the project resources by their resource path
  return projectList.reduce((col, cur) => {
    let key = `${RESOURCES[cur.kind].plural}/${cur.name}`;
    if (cur.scope) {
      const scopeKind = RESOURCES[cur.kind].scope;
      const scope = RESOURCES[scopeKind];
      key = `${scope.plural}/${cur.scope}/${key}`;
    }
    col[key] = cur;
    return col;
  }, {});
}

// Get all the resources that have the projet tag.
async function loadProjectFromCentral() {
  // Load the tagged scopes.
  // Then load the tagged resoruces

  const rootKinds = Object.keys(RESOURCES).filter(r => !RESOURCES[r].scope);
  let scopes = [];
  let project = [];

  for (const kind of rootKinds) {
    const resources = await loadTaggedResource(kind, config.tag);
    scopes = scopes.concat(resources);
  }
  project = project.concat(scopes);

  // Now load Scoped kinds in all tagged scopes
  for (const scope of scopes) {
    const scopedKinds = Object.keys(RESOURCES).filter(r => RESOURCES[r].scope === scope.kind);
    for (const kind of scopedKinds) {
      const resources = await loadTaggedResource(kind, config.tag, scope.name);
      // Surprisingly the scope isn't in the response.
      resources.forEach(r => {
        r.scope = scope.name;
      })
      project = project.concat(resources);
    }
  }

  return mapByPath(project);
}

async function loadTaggedResource(kind, tag, scope) {
  const resource = RESOURCES[kind];
  let url;
  if (scope) {
    url = `${RESOURCES[resource.scope].plural}/${scope}/${resource.plural}`
  } else {
    url = `${resource.plural}`
  }
  
  try {
    const response = await axios({
      method: 'get',
      url: `${config.central}/management/v1alpha1/${url}`,
      params: {
        query: `tags=in=${tag}`
      },
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    return response.data;
  } catch (e) {
    console.log(e);
    throw e;
  }
}

// For simplicity going to load the entire project and diff it.
// It's the easiest way to find deletions and multiple resources per file.
async function loadProjectFiles() {
  const project = []
  for await (const yamlFile of getYaml(process.env.GITHUB_WORKSPACE)) {
    const raw = fs.readFileSync(yamlFile, 'utf8');
    const doc = yaml.safeLoad(raw);
    project.push(doc);
  }

  return mapByPath(project);
}

function delta(desired, actual) {
  const deleted = Object.keys(actual).filter(f => !desired[f]);
  const created = Object.keys(desired).filter(f => !actual[f]).map(c => desired[c]);

  const updated = []
  // TODO UPDATED

  // Add the project tag if it's not already there
  created.concat(updated).forEach(r => {
    r.tags = r.tags || [];
    if (r.tags.indexOf(config.tag) === -1) {
      r.tags.push(config.tag);
    }
  });

  return {
    deleted,
    created,
    updated
  }
}


// Load the yaml and convert to resource
async function processProject() {
  try {
    accessToken = await access.getAccessToken();
    const filesystemProject = await loadProjectFiles();
    const centralProject = await loadProjectFromCentral();
    
    const changes = delta(filesystemProject, centralProject);
    console.log(changes);
    // TODO: ADD gateways to project and apply diff to central
  } catch (err) {
    console.error(err);
    throw err;
  }
}

module.exports = {
  process: processProject
};
