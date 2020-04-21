const central = require("./central");
const core = require("@actions/core");

async function run() {
  try {
    await central.process();
  } catch (error) {
    console.error("⚠️ Error deploying", error);
    core.setFailed(error.message);
  }
}

run();
