const access = require('./access');
const config = require('./config');
const yaml = require('js-yaml');
const axios = require('axios');
const fs = require('fs');
const { getYaml } = require('./utils');
const deepEqual = require('deep-equal')

let RESOURCES;
const ORDER = [
  'Gateway',
  'Policy',
  'Stage',
  'Environment',
  'APIService',
  'APIServiceRevision',
  'APIServiceInstance',
  'ConsumerInstance',
  'VirtualAPI',
  'VirtualAPIDefinition',
  'CorsRule',
  'Rules',
  'PathRoute',
  'Deployment'];

// TODO: Should string together order dynamically from defs.
if (config.prodDeployment) {
  RESOURCES = {
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
    }
  };
  
} else {
  RESOURCES = {
    'Gateway' : {
      plural: 'gateways'
    },
    'Policy': {
      scope: 'Gateway',
      plural: 'policies'
    },
    'Stage': {
      scope: 'Gateway',
      plural: 'stages'
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
    'CorsRule': {
      scope: 'Environment',
      plural: 'corsrules'
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
}

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
    try {
      const resources = await loadTaggedResource(kind, config.tag);
      //console.log(resources);
      scopes = scopes.concat(resources);
    } catch (e) {
      throw e;
    }
  }
  project = project.concat(scopes);

  // Now load Scoped kinds in all tagged scopes
  for (const scope of scopes) {
    const scopedKinds = Object.keys(RESOURCES).filter(r => RESOURCES[r].scope === scope.kind);
    for (const kind of scopedKinds) {
      try {
        const resources = await loadTaggedResource(kind, config.tag, scope.name);
        // Surprisingly the scope isn't in the response.
        resources.forEach(r => {
          r.scope = scope.name;
        })
        project = project.concat(resources);
      } catch (e) {
        throw e;
      }
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
  const project = [];
  try {
    for await (const yamlFile of getYaml(process.env.GITHUB_WORKSPACE)) {
      console.log(`Loading ${yamlFile}`);
      const raw = fs.readFileSync(yamlFile, 'utf8');
      yaml.safeLoadAll(raw, doc => project.push(doc));
    }
  } catch (e) {
    throw e;
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

  const deleted = Object.keys(actual).filter(f => !desired[f]).reverse();
  let created = Object.keys(desired).filter(f => !actual[f]);
  let updated = Object.keys(desired).filter(f => {
    // Tag order is not maintained. Updated if not created, not deleted and contents differ
    // (other than tag ordering).
    if (desired[f] && actual[f]) {
      desired[f].tags = (desired[f].tags || []).sort();
      actual[f].tags = (actual[f].tags || []).sort();
      return deleted.indexOf(f) === -1
        && created.indexOf(f) === -1
        && !deepEqual(desired[f], actual[f]);
    } else {
      return desired[f] === actual[f];
    }
  });
  
  created = created.map(c => desired[c]);
  updated = updated.map(c => desired[c]);

  return {
    deleted,
    created,
    updated
  }
}

async function applyChanges({deleted, created, updated}) {
  updated = updated.sort((l,r) => ORDER.indexOf(l.kind) > ORDER.indexOf(r.kind) ? 1 : -1);
  created = created.sort((l,r) => ORDER.indexOf(l.kind) > ORDER.indexOf(r.kind) ? 1 : -1);

  try {
    summarize(deleted, created, updated);
    await applyDeletes(deleted);
    await applyCreates(created);
    await applyUpdates(updated);
  } catch(e) {
    throw e;
  }
}

function summarize(deleted, created, updated) {
  console.log('Execution Plan: ')
  for (let d of deleted) {
    console.log(`    Deleting: ${d}`)
  }

  for (let c of created) {
    console.log(`    Creating: ${c.kind}/${c.name}`)
  }

  for (let u of updated) {
    console.log(`    Updating: ${u.kind}/${u.name}`)
  }
}

async function applyCreates(created) {
  for (let c of created) {
    let key = resourceUrl(c);
    key = key.substr(0, key.lastIndexOf('/')); 
    delete c.apiVersion;
    delete c.group;
    delete c.kind;
    try {
      await applyToCentral('post', key, c);
    } catch (e) {
      throw e;
    }
  }
}

async function applyUpdates(updated) {
  for (let u of updated) {
    const key = resourceUrl(u);
    delete u.apiVersion;
    delete u.group;
    delete u.kind;
    try {
      await applyToCentral('put', key, u);
    } catch (e) {
      throw e;
    }
  }
}

async function applyDeletes(deleted) {
  for (let d of deleted) {
    try {
      await applyToCentral('delete', d);
    } catch (e) {
      throw e;
    }
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
    if (method === 'delete' && e.response && e.response.status === 404) {
      // ignore it
      return;
    }
    console.error(e);
    throw e;
  }
}

// Load the yaml and convert to resource
async function processProject() {
  try {
    accessToken = await access.getAccessToken();
    if (process.env.GITHUB_WORKSPACE) {
      const filesystemProject = await loadProjectFiles();
      const centralProject = await loadProjectFromCentral();
      
      const changes = delta(filesystemProject, centralProject);
      await applyChanges(changes);
      console.log("✅ Deploy Complete");
    } else {
      console.log(accessToken);
    }
  } catch (err) {
    console.error(err);
    throw err;
  }
}

module.exports = {
  process: processProject
};
