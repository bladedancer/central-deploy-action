const core = require('@actions/core');

function withDefault(value, defaultValue) {
    if (value === '' || value === null || value === undefined) {
        return defaultValue;
    }
    return value;
}
  
module.exports = {
    files: core.getInput('files', { required: true }),
    kid: core.getInput('kid', { required: true }),
    alg: withDefault(core.getInput('alg', { required: false }), 'RS256'),
    iss: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer:' + core.getInput('sub', { required: true }),
    aud: withDefault(core.getInput('aud', { required: false }), 'https://login.axway.com/auth/realms/Broker'),
    sub: core.getInput('sub', { required: true }),
    privateKey: core.getInput('privateKey', { required: true })
};