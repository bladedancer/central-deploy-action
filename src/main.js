const central = require("./central");
const core = require("@actions/core");

async function run() {
  try {
    await central.process();
    console.log("✅ Deploy Complete");
  } catch (error) {
    console.error("⚠️ Error deploying", error);
    core.setFailed(error.message);
  }
}

run();
