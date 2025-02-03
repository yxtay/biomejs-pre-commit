const { exec } = require("child_process");
const { promisify } = require("util");
const fs = require("fs").promises;
const path = require("path");

const execPromise = promisify(exec);

const REPO_DIR = path.resolve(__dirname, "..", "..");
const PACKAGE_NAME = "@biomejs/biome";

async function main() {
  try {
    const missingTags = await getMissingTags();
    if (!missingTags.length) {
      console.log("No new versions found");
      return 0;
    }

    for (const tag of missingTags) {
      console.log(`Updating to ${tag}`);
      await updateFiles(tag);
      await stageCommitAndTag(tag);
    }
    return 0;
  } catch (error) {
    console.error("An error occurred:", error);
    process.exit(1);
  }
}

async function getMissingTags() {
  const allTags = await getAllTags();
  const existingTags = await getExistingTags();
  return allTags.filter((tag) => !existingTags.includes(tag)).sort();
}

async function getAllTags() {
  const allVersions = await getNodePackageVersions(PACKAGE_NAME);
  const filteredVersions = allVersions.filter((v) => !v.includes("nightly"));
  return filteredVersions.map((v) => `v${v}`).sort();
}

async function getExistingTags() {
  const tags = await git("tag", "--list");
  return tags
    .split("\n")
    .filter((t) => t.startsWith("v"))
    .sort();
}

async function getNodePackageVersions(packageName) {
  const cmd = `npm view ${packageName} --json`;
  const { stdout } = await execPromise(cmd);
  const output = JSON.parse(stdout);
  return output.versions;
}

async function updateFiles(tag) {
  const version = toVersion(tag);
  await replaceInReadme(version);
  await replaceInPackageJson(version);
}

function toVersion(tag) {
  return tag.replace("v", "", 1);
}

async function replaceInReadme(version) {
  const readmeFile = path.join(REPO_DIR, "README.md");
  let readme = await fs.readFile(readmeFile, "utf8");
  const currentVersion = await getCurrentVersion();
  const newReadme = readme.replace(currentVersion, version);
  await fs.writeFile(readmeFile, newReadme, "utf8");
}

async function getCurrentVersion() {
  const packageJsonFile = path.join(REPO_DIR, "package.json");
  const packageJson = JSON.parse(await fs.readFile(packageJsonFile, "utf8"));
  return packageJson.dependencies[PACKAGE_NAME];
}

async function replaceInPackageJson(version) {
  const packageJsonFile = path.join(REPO_DIR, "package.json");
  const packageJson = JSON.parse(await fs.readFile(packageJsonFile, "utf8"));
  packageJson.dependencies[PACKAGE_NAME] = version;
  await fs.writeFile(
    packageJsonFile,
    JSON.stringify(packageJson, null, 2),
    "utf8"
  );
}

async function stageCommitAndTag(tag) {
  await git("add", "package.json", "README.md");
  await git("commit", "-m", `"MAINT: upgrade to ${PACKAGE_NAME} ${tag}"`);
  await git("tag", tag);
}

async function git(...cmd) {
  const { stdout } = await execPromise(
    ["git", "-C", REPO_DIR, ...cmd].join(" ")
  );
  return stdout;
}

main();
