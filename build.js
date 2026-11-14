/**
 * Standalone Production Build Script for Wude Mart Admin Console
 * Prepares the production distribution for Cloudflare Pages.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_DIR = path.join(__dirname, 'dist');
const SRC_DIR = path.join(__dirname, 'src');
const PUBLIC_DIR = path.join(__dirname, 'public');

console.log('🚀 Starting Wude Mart Admin Console production build...');

// 1. Clean and recreate dist
if (fs.existsSync(DIST_DIR)) {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DIST_DIR, { recursive: true });
fs.mkdirSync(path.join(DIST_DIR, 'src'), { recursive: true });

// 2. Copy public directory contents (including _redirects for Cloudflare Pages)
if (fs.existsSync(PUBLIC_DIR)) {
  for (const item of fs.readdirSync(PUBLIC_DIR)) {
    const srcPath = path.join(PUBLIC_DIR, item);
    const destPath = path.join(DIST_DIR, item);
    fs.copyFileSync(srcPath, destPath);
    console.log(`✓ Copied public asset: ${item}`);
  }
}

// 3. Copy src files
for (const file of fs.readdirSync(SRC_DIR)) {
  const srcPath = path.join(SRC_DIR, file);
  const destPath = path.join(DIST_DIR, 'src', file);
  if (fs.statSync(srcPath).isFile()) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`✓ Bundled module: src/${file}`);
  }
}

// 4. Process and copy index.html
let htmlContent = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
fs.writeFileSync(path.join(DIST_DIR, 'index.html'), htmlContent, 'utf-8');
console.log('✓ Emitted dist/index.html');

console.log('✅ Production build completed successfully in ./dist');
