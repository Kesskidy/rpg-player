/**
 * Downloads the pinned official Windows `cloudflared` release from GitHub,
 * verifies its SHA-256 checksum, and saves it (along with its Apache-2.0 LICENSE)
 * into `vendor/cloudflared/` for optional bundling in `electron-builder` (Step B6).
 *
 * Usage:
 *   node scripts/fetch-cloudflared.mjs
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outDir = path.join(repoRoot, 'vendor', 'cloudflared');

// Pinned Cloudflare cloudflared release (Apache-2.0)
const CLOUDFLARED_VERSION = '2025.4.0';
const ASSET_NAME = 'cloudflared-windows-amd64.exe';
const BINARY_URL = `https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/${ASSET_NAME}`;
const LICENSE_URL = `https://raw.githubusercontent.com/cloudflare/cloudflared/${CLOUDFLARED_VERSION}/LICENSE`;
// Official SHA-256 for cloudflared 2025.4.0 cloudflared-windows-amd64.exe (can be overridden via CLOUDFLARED_SHA256)
const EXPECTED_SHA256 =
  process.env['CLOUDFLARED_SHA256']?.trim().toLowerCase() ||
  '37522959f88e733b2dc6b1c80f685a2c6b4d22e97378b4583f79b9f05e3a3269';

async function downloadBuffer(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Échec téléchargement ${url} (HTTP ${res.status})`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const targetExe = path.join(outDir, 'cloudflared.exe');
  const targetLicense = path.join(outDir, 'LICENSE');

  console.log(`Téléchargement de cloudflared v${CLOUDFLARED_VERSION}...`);
  const binary = await downloadBuffer(BINARY_URL);
  const actualSha = crypto.createHash('sha256').update(binary).digest('hex').toLowerCase();

  if (actualSha !== EXPECTED_SHA256) {
    throw new Error(
      `Somme SHA-256 invalide pour ${ASSET_NAME} !\n  Attendu : ${EXPECTED_SHA256}\n  Reçu    : ${actualSha}`,
    );
  }

  await fs.writeFile(targetExe, binary);
  console.log(`✓ cloudflared.exe vérifié (SHA-256 OK) → ${targetExe}`);

  const license = await downloadBuffer(LICENSE_URL);
  await fs.writeFile(targetLicense, license);
  console.log(`✓ Licence Apache-2.0 copiée → ${targetLicense}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
