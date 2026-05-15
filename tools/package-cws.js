import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const version = manifest.version || "0.0.0";
const outputDir = path.join(root, "dist", "chrome-web-store");
const outputPath = path.join(outputDir, `omnisignal-pixel-tracker-v${version}.zip`);
const packageEntries = ["manifest.json", "logo.png", "assets", "src"];
let crcTable;

fs.mkdirSync(outputDir, { recursive: true });

const files = packageEntries.flatMap((entry) => collectFiles(path.join(root, entry), entry));
writeStoredZip(
  outputPath,
  files.map(({ absolutePath, archivePath }) => ({
    archivePath: archivePath.replaceAll("\\", "/"),
    data: fs.readFileSync(absolutePath),
    mtime: fs.statSync(absolutePath).mtime,
  })),
);

console.log(`Chrome Web Store package created: ${outputPath}`);

function collectFiles(absolutePath, archivePath) {
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing package entry: ${archivePath}`);
  }
  const stat = fs.statSync(absolutePath);
  if (stat.isFile()) return [{ absolutePath, archivePath }];
  return fs
    .readdirSync(absolutePath, { withFileTypes: true })
    .flatMap((entry) =>
      collectFiles(
        path.join(absolutePath, entry.name),
        path.join(archivePath, entry.name),
      ),
    );
}

function writeStoredZip(filePath, entries) {
  let offset = 0;
  const localParts = [];
  const centralParts = [];

  for (const entry of entries) {
    const name = Buffer.from(entry.archivePath);
    const crc = crc32(entry.data);
    const { dosTime, dosDate } = toDosDateTime(entry.mtime);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(entry.data.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, name, entry.data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(entry.data.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);

    offset += localHeader.length + name.length + entry.data.length;
  }

  const centralStart = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);

  fs.writeFileSync(filePath, Buffer.concat([...localParts, ...centralParts, end]));
}

function crc32(buffer) {
  crcTable ||= buildCrcTable();
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildCrcTable() {
  return new Uint32Array(256).map((_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  });
}

function toDosDateTime(date) {
  const year = Math.max(date.getFullYear(), 1980);
  return {
    dosTime:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
    dosDate: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}
