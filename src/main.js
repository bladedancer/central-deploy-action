const access = require('./access');
const core = require('@actions/core');

async function run() {
  const inputs = getUserArguments();

  try {
    await access.getAccessToken(inputs);
    await syncFiles();
    console.log("✅ Deploy Complete");
  }
  catch (error) {
    console.error("⚠️ Error deploying", error);
    core.setFailed(error.message);
  }
}

run();


function getUserArguments() {
  return {
    kid: core.getInput('kid', { required: true }),
    alg: withDefault(core.getInput('alg', { required: false }), 'RS256'),
    iss: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer:' + core.getInput('sub', { required: true }),
    aud: withDefault(core.getInput('aud', { required: false }), 'https://login.axway.com/auth/realms/Broker'),
    sub: core.getInput('sub', { required: true }),
    privateKey: core.getInput('privateKey', { required: true })
  };
}

function withDefault(value, defaultValue) {
  if (value === '' || value === null || value === undefined) {
    return defaultValue;
  }
  return value;
}

/**
 * Sync changed files
 */
async function syncFiles() {
  console.log(JSON.stringify(process.env, null, 4));
  // TODO: Load the yaml
  // try {
  //   await core.group("Uploading files", async () => {
  //     return await exec.exec(`git ftp push --force --auto-init --verbose --syncroot ${args.local_dir} --user ${args.ftp_username} --passwd ${args.ftp_password} ${args.gitFtpArgs} ${args.ftp_server}`);
  //   });
  // }
  // catch (error) {
  //   console.error("⚠️ Failed to upload files");
  //   core.setFailed(error.message);
  //   throw error;
  // }
}
