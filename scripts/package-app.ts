/**
 * Build the ChatGPT app submission package (Agent Plugins format) from
 * workers/mcp/package/: plugin.json, mcp.json and assets/ (logo and composer
 * icon rendered from public/favicon.svg), zipped with the files at the top
 * level of the archive.
 *
 * Usage: pnpm package:app   ->  dist-app/molviewer-app.zip
 *
 * Checks the listing limits from OpenAI's submission docs before writing.
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';
import { Resvg } from '@resvg/resvg-js';

const SRC = 'workers/mcp/package';
const OUT_DIR = 'dist-app';
const OUT = join(OUT_DIR, 'molviewer-app.zip');

// --- Assets ---------------------------------------------------------------
const svg = readFileSync('public/favicon.svg', 'utf8');
mkdirSync(join(SRC, 'assets'), { recursive: true });
for (const [name, size] of [
  ['logo.png', 512],
  ['icon.png', 128],
] as const) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(join(SRC, 'assets', name), png);
}

// --- Checks ---------------------------------------------------------------
interface PluginJson {
  name: string;
  extensions: {
    'com.openai': {
      interface: Record<string, unknown> & { defaultPrompt: string[] };
      review: { test_cases: { positive: unknown[]; negative: unknown[] } };
    };
  };
}
const plugin = JSON.parse(readFileSync(join(SRC, 'plugin.json'), 'utf8')) as PluginJson;
const ui = plugin.extensions['com.openai'].interface;
const cases = plugin.extensions['com.openai'].review.test_cases;
const problems: string[] = [];
const maxLen = (field: string, max: number) => {
  const v = ui[field];
  if (typeof v !== 'string' || !v) problems.push(`${field} is missing`);
  else if (v.length > max) problems.push(`${field} is ${v.length} characters (max ${max})`);
};
maxLen('displayName', 30);
maxLen('shortDescription', 30);
maxLen('longDescription', 4000);
maxLen('developerName', 80);
for (const url of ['websiteURL', 'supportURL', 'privacyPolicyURL', 'termsOfServiceURL']) {
  if (typeof ui[url] !== 'string' || !(ui[url] as string).startsWith('https://')) problems.push(`${url} must be an https URL`);
}
if (ui.defaultPrompt.length > 3 || ui.defaultPrompt.some((p) => p.length > 128)) problems.push('defaultPrompt: at most 3, 128 characters each');
if (cases.positive.length !== 5) problems.push(`need exactly 5 positive test cases (have ${cases.positive.length})`);
if (cases.negative.length !== 3) problems.push(`need exactly 3 negative test cases (have ${cases.negative.length})`);
if (problems.length) {
  console.error(`plugin.json problems:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}

// --- Zip (deflate, files at the archive root) -----------------------------
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const entries = files(SRC).sort();
const locals: Buffer[] = [];
const centrals: Buffer[] = [];
let offset = 0;
for (const path of entries) {
  const name = Buffer.from(relative(SRC, path).replace(/\\/g, '/'));
  const data = readFileSync(path);
  const packed = deflateRawSync(data);
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(packed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  locals.push(local, name, packed);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4); // version made by
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(packed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42);
  centrals.push(central, name);

  offset += local.length + name.length + packed.length;
}
const centralSize = centrals.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, Buffer.concat([...locals, ...centrals, end]));
console.log(`wrote ${OUT}: ${entries.map((p) => relative(SRC, p).replace(/\\/g, '/')).join(', ')}`);
