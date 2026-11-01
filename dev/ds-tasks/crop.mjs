import sharp from 'sharp';
const [src, out, x, y, w, h] = process.argv.slice(2);
await sharp(src).extract({ left: Number(x), top: Number(y), width: Number(w), height: Number(h) }).toFile(out);
