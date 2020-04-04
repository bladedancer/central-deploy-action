const { resolve } = require("path");
const { readdir } = require("fs").promises;

async function* getYaml(dir) {
  try {
    const dirents = await readdir(dir, { withFileTypes: true });
    for (const dirent of dirents) {
      const res = resolve(dir, dirent.name);
      if (dirent.isDirectory()) {
        if (!dirent.name.startsWith(".")) {
          yield* getYaml(res);
        }
      } else if (dirent.name.endsWith(".yaml" || dirent.name.endsWith(".yml"))) {
        yield res;
      }
    }
  } catch(e) {
    throw e;
  }
}

module.exports = {
  getYaml
};
