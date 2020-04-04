const core = require("@actions/core");

function withDefault(value, defaultValue) {
  if (value === "" || value === null || value === undefined) {
    return defaultValue;
  }
  return value;
}

module.exports = {
  kid: core.getInput("kid", { required: true }),
  alg: withDefault(core.getInput("alg", { required: false }), "RS256"),
  iss:
    "urn:ietf:params:oauth:client-assertion-type:jwt-bearer:" +
    core.getInput("sub", { required: true }),
  aud: withDefault(
    core.getInput("aud", { required: false }),
    "https://login.axway.com/auth/realms/Broker"
  ),
  sub: core.getInput("sub", { required: true }),
  privateKey: core.getInput("privateKey", { required: true }),
  tag: core.getInput("tag", { required: true }),
  central: withDefault(
    core.getInput("central", { required: false }),
    "https://apicentral.axway.com/apis"
  ),
  prodDeployment: (core.getInput("aud", {required: false}) !== 'https://login-preprod.axway.com/auth/realms/Broker')
};
