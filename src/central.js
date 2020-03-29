const access = require('./access');
const config = require('./config');

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
async function process(deleted, modified) {
    await access.getAccessToken();

    // TODO ORDERING
    deleted.forEach(deleteResource);

    modified.sort((l,r) => ORDER.indexOf(l.kind) < ORDER.indexOf(r.kind))
        .forEach(syncResource);
} 

async function deleteResource(deletedPath) {
    console.log("DELETED: " + deletedPath);
}

async function syncResource(yaml) {
    // TODO convert the yaml to a json.
    // FORMAT the creation url
    console.log(yaml);
    console.log("-----------------------------------");
}

module.exports = {
    process
}