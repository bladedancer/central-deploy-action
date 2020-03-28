const access = require('./access');
const fs   = require('fs');
const path = require('path');

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
async function processYaml(yamls) {
    await access.getAccessToken(inputs);

    yamls.sort((l,r) => ORDER.indexOf(l.kind) < ORDER.indexOf(r.kind))
        .forEach(syncResoure);
} 

async function syncResource(yaml) {
    // TODO convert the yaml to a json.
    // FORMAT the creation url
    console.log(yaml);
    console.log("-----------------------------------");
}


module.exports = {
    processYaml
}