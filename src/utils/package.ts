import { readFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const _dirname = dirname(fileURLToPath(import.meta.url));
const path = join(_dirname, "../..", "package.json");

export default JSON.parse(await readFile(path, "utf-8"));
