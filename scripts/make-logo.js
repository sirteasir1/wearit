const sharp = require("sharp");
const path = require("path");

const SRC = "/Users/yerbolat/Downloads/Create_a_minimalist,_iconic_symbol_202606032142.jpeg";
const pub = path.join(process.cwd(), "public");
const appDir = path.join(process.cwd(), "app");

(async () => {
  // Tight crop of the mark (trims the white margin around it)
  const trimmed = await sharp(SRC).trim({ threshold: 18 }).toBuffer();

  // Transparent symbol: key out the white background (white -> alpha 0),
  // keep the navy mark. The interior white line becomes a transparent cut.
  const { data, info } = await sharp(trimmed)
    .resize({ height: 320 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  for (let i = 0; i < data.length; i += ch) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    let a;
    if (lum <= 175) a = 255;
    else if (lum >= 238) a = 0;
    else a = Math.round((255 * (238 - lum)) / (238 - 175));
    data[i + 3] = a;
  }
  await sharp(data, { raw: info }).png().toFile(path.join(pub, "logo-mark.png"));

  // Favicon: mark centered on a white square, padded
  await sharp(trimmed)
    .resize(200, 200, { fit: "contain", background: "#ffffff" })
    .extend({ top: 28, bottom: 28, left: 28, right: 28, background: "#ffffff" })
    .resize(256, 256)
    .png()
    .toFile(path.join(appDir, "icon.png"));

  // Apple touch icon
  await sharp(trimmed)
    .resize(360, 360, { fit: "contain", background: "#ffffff" })
    .extend({ top: 60, bottom: 60, left: 60, right: 60, background: "#ffffff" })
    .resize(180, 180)
    .png()
    .toFile(path.join(appDir, "apple-icon.png"));

  console.log("logo + favicons written");
})().catch((e) => { console.error(e); process.exit(1); });
