const central = require("./central");
const core = require("@actions/core");

async function run() {
  try {
    await central.process();
  } catch (err) {
    console.error("⚠️ Error deploying");
    if (err.response) {
      console.error(JSON.stringify(err.response.data, null, 2));
      core.setFailed(JSON.stringify(err.response.data));
    } else {
      console.error(err);
      core.setFailed(err.message);
    }
  }
}

run();
