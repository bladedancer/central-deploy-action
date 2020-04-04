const access = require('./access');
const config = require('./config');
const yaml = require('js-yaml');
const axios = require('axios');
const fs = require('fs');
const { getYaml } = require('./utils');
const deepEqual = require('deep-equal')

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
    plural: 'deployments'
  }
};

let accessToken;

function resourceUrl(resource) {
  let key = `${RESOURCES[resource.kind].plural}/${resource.name}`;
  if (resource.scope) {
    const scopeKind = RESOURCES[resource.kind].scope;
    const scope = RESOURCES[scopeKind];
    key = `${scope.plural}/${resource.scope}/${key}`;
  }
  return key;
}

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
    console.log(`Loading: ${url}`);
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
    console.log(`Loading ${yamlFile}`);
    const raw = fs.readFileSync(yamlFile, 'utf8');
    const doc = yaml.safeLoad(raw);
    project.push(doc);
  }

  return mapByPath(project);
}

function delta(desired, actual) {
  // Clean up the objects
  Object.values(desired).forEach(d => {
    d.attributes = d.attributes || {};
    d.tags = d.tags || [];
    if (d.tags.indexOf(config.tag) === -1) {
      d.tags.push(config.tag);
    }
  });
  Object.values(actual).forEach(a => {
    delete a.metadata;
  });

  const deleted = Object.keys(actual).filter(f => !desired[f]);
  let created = Object.keys(desired).filter(f => !actual[f]);
  let updated = Object.keys(desired).filter(f => deleted.indexOf(f) === -1 && created.indexOf(f) === -1 && !deepEqual(desired[f], actual[f]));
  
  created = created.map(c => desired[c]);
  updated = updated.map(c => desired[c]);

  return {
    deleted,
    created,
    updated
  }
}

function applyChanges({deleted, created, updated}) {
  applyDeletes(deleted);
  applyCreates(created);
  applyUpdates(updated);
}

function applyCreates(created) {
  created.sort((l,r) => Object.keys(RESOURCES).indexOf(l.scope) > Object.keys(RESOURCES).indexOf(r.scope));
  for (let c of created) {
    const key = resourceUrl(c);
    delete c.apiVersion;
    delete c.group;
    delete c.kind;
    applyToCentral('post', key, c);
  }
}

function applyUpdates(updated) {
  updated.sort((l,r) => Object.keys(RESOURCES).indexOf(l.scope) > Object.keys(RESOURCES).indexOf(r.scope));
  for (let u of updated) {
    const key = resourceUrl(u);
    delete u.apiVersion;
    delete u.group;
    delete u.kind;
    applyToCentral('put', key, u);
  }
}

function applyDeletes(deleted) {
  for (let d of deleted) {
    applyToCentral('delete', d);
  }
}

async function applyToCentral(method, url, data) {
  try {
    console.log(`${method} ${url}`);
    const response = await axios({
      method,
      url: `${config.central}/management/v1alpha1/${url}`,
      data,
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    return response.data;
  } catch (e) {
    console.error(e);
    throw e;
  }
}

// Load the yaml and convert to resource
async function processProject() {
  try {
    accessToken = await access.getAccessToken();
    const filesystemProject = await loadProjectFiles();
    const centralProject = await loadProjectFromCentral();
    
    const changes = delta(filesystemProject, centralProject);
    applyChanges(changes);
    // TODO: ADD gateways to project and apply diff to central
  } catch (err) {
    console.error(err);
    throw err;
  }
}

module.exports = {
  process: processProject
};
