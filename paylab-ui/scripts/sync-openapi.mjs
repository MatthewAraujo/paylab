import { writeFile } from "node:fs/promises";

const source =
  process.env.PAYLAB_OPENAPI_URL ?? "http://localhost:3333/docs-json";
const response = await fetch(source, {
  headers: { Accept: "application/json" },
});

if (!response.ok) {
  throw new Error(
    `Could not fetch PayLab OpenAPI from ${source}: HTTP ${response.status}`,
  );
}

const document = await response.json();
await writeFile(
  "openapi/paylab.json",
  `${JSON.stringify(document, null, 2)}\n`,
  "utf8",
);
console.log(`Updated openapi/paylab.json from ${source}`);
