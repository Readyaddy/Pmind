/**
 * Captures frames from demo.html using Puppeteer.
 * Saves PNGs to ./frames/ at 8 fps for ~62 seconds (one full loop).
 * Run: node capture_frames.js
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const WIDTH    = 1280;
const HEIGHT   = 720;
const FPS      = 8;          // frames per second
const DURATION = 62;         // seconds to capture
const OUT_DIR  = path.join(__dirname, 'frames');
const HTML     = 'file:///' + path.join(__dirname, 'demo.html').replace(/\\/g, '/');

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR);
  // clear old frames
  fs.readdirSync(OUT_DIR).forEach(f => fs.unlinkSync(path.join(OUT_DIR, f)));

  console.log('Launching browser…');
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: WIDTH, height: HEIGHT },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
  });
  const page = await browser.newPage();

  console.log(`Loading ${HTML}`);
  await page.goto(HTML, { waitUntil: 'networkidle0', timeout: 30000 });

  // Wait for fonts + animation to start (matches document.fonts.ready + 500ms)
  await new Promise(r => setTimeout(r, 2000));

  const totalFrames = DURATION * FPS;
  const intervalMs  = 1000 / FPS;

  console.log(`Capturing ${totalFrames} frames at ${FPS}fps…`);

  for (let i = 0; i < totalFrames; i++) {
    const file = path.join(OUT_DIR, `frame_${String(i).padStart(5, '0')}.png`);
    await page.screenshot({ path: file, type: 'png' });
    if (i % 40 === 0) process.stdout.write(`  ${Math.round(i / totalFrames * 100)}%\r`);
    await new Promise(r => setTimeout(r, intervalMs));
  }

  await browser.close();
  console.log(`\nDone. ${totalFrames} frames saved to ./frames/`);
}

main().catch(e => { console.error(e); process.exit(1); });
