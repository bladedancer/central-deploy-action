const access = require('./access');
const config = require('./config');
const graph = require('./graph');
const yaml = require('js-yaml');
const axios = require('axios');
const fs = require('fs');
const { getYaml } = require('./utils');
const deepEqual = require('deep-equal')

let RESOURCES;
let ORDER;
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

// Get all the definitions from centrla
async function loadDefinitions() {
  try {
    const resources = await getAll({
      url: `${config.central}/definitions/v1alpha1/groups/management/resources`
    });
    return graph.process(resources);
  } catch (e) {
    throw e;
  }
}

// Do a get, loading all pages and adding authorization header.
async function getAll(req) {
  req.method = "get";
  req.params = req.params || {};
  let origParams = req.params;
  let offset = 0;
  let count = 20;
  let response;
  let aggregateResponse = [];

  // Auth
  req.headers = req.headers || {};
  req.headers.Authorization = `Bearer ${accessToken}`;

  console.log(`Loading: ${req.url}`);
  try {
    do {
      console.log(`${offset}-${offset+count}`);
      req.params = {
        ...origParams,
        offset,
        count
      };
      response = await axios(req);
      aggregateResponse = aggregateResponse.concat(response.data);
      offset += response.data.length;
    } while (response.data.length === count);    
  } catch (e) {
    throw e;
  }

  return aggregateResponse;
}

// Get all the resources that have the projet tag.
async function loadProjectFromCentral() {
  // Load the tagged scopes.
  // Then load the tagged resoruces

  const rootKinds = Object.keys(RESOURCES).filter(r => !RESOURCES[r].scope);
  let scopes = [];
  let project = [];

  let rootProms = [];
  for (const kind of rootKinds) {
    rootProms.push(loadTaggedResource(kind, config.tag));
  }

  try {
    const resps = await Promise.all(rootProms)
    resps.forEach(resources => {
      scopes = scopes.concat(resources);
    });
  } catch (e) {
    throw e;
  }

  project = project.concat(scopes);

  // Now load Scoped kinds in all tagged scopes
  let scopedProms = [];
  for (const scope of scopes) {
    const scopedKinds = Object.keys(RESOURCES).filter(r => RESOURCES[r].scope === scope.kind);
    for (const kind of scopedKinds) {
      scopedProms.push(loadTaggedResource(kind, config.tag, scope.name));
    }
  }

  try {
    const resps = await Promise.all(scopedProms)
    resps.forEach(resources => {
      // On api-server master scope is not in the resource, add it if not set
      resources.forEach(r => {
        r.scope = r.scope || r.metadata.scope.name;
      })
      project = project.concat(resources);
    });
  } catch (e) {
    throw e;
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
      yaml.safeLoadAll(raw, doc => {
        if (!doc) {
          // An empty block
          return;
        }
        if (!RESOURCES[doc.kind]) {
          throw new Error(`Resource in file ${yamlFile} of kind ${doc.kind} does not exist on the server.`);
        }
        project.push(doc);
      });
    }
  } catch (e) {
    throw e;
  }

  return mapByPath(project);
}

function delta(desired, actual) {
  // Clean up the objects
  Object.values(desired).forEach(d => {
    delete d.description;
    d.attributes = d.attributes || {};
    d.tags = d.tags || [];
    if (d.tags.indexOf(config.tag) === -1) {
      d.tags.push(config.tag);
    }
  });
  Object.values(actual).forEach(a => {
    delete a.metadata;
  });

  let deleted = Object.keys(actual).filter(f => !desired[f]);
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
  deleted = deleted.map(c => actual[c]);

  return {
    deleted,
    created,
    updated
  }
}

async function applyChanges({deleted, created, updated}) {
  updated = updated.sort((l,r) => ORDER.indexOf(l.kind) > ORDER.indexOf(r.kind) ? 1 : -1);
  created = created.sort((l,r) => ORDER.indexOf(l.kind) > ORDER.indexOf(r.kind) ? 1 : -1);
  deleted = deleted.sort((l,r) => ORDER.indexOf(l.kind) > ORDER.indexOf(r.kind) ? -1 : 1); // delete bottom up

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
    console.log(`    Deleting: ${d.kind}/${d.name}`)
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
      const key = resourceUrl(d);
      await applyToCentral('delete', key);
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
    throw e;
  }
}

// Load the yaml and convert to resource
async function processProject() {
  try {
    accessToken = await access.getAccessToken();
    if (process.env.GITHUB_WORKSPACE) {
      let defs = await loadDefinitions();
      RESOURCES = defs.naming;
      ORDER = defs.order;

      const filesystemProject = await loadProjectFiles();
      const centralProject = await loadProjectFromCentral();
      
      const changes = delta(filesystemProject, centralProject);
      await applyChanges(changes);
      console.log("✅ Deploy Complete");
    } else {
      console.log(accessToken);
    }
  } catch (err) {
    throw err;
  }
}

module.exports = {
  process: processProject
};
