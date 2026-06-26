export interface RawTextItem {
  str: string;
  x: number;
  y: number;
}

export interface RawPage {
  width: number;
  height: number;
  items: RawTextItem[];
}

export interface ParsedPackage {
  kode_pickup: string;
  nama_penerima: string;
  alamat: string;
  kurir: string;
}

interface Line {
  y: number;
  items: RawTextItem[];
}

function groupLines(items: RawTextItem[]): Line[] {
  const sorted = items
    .filter((i) => i.str.trim() !== "")
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: Line[] = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - it.y) <= 3) {
      last.items.push(it);
    } else {
      lines.push({ y: it.y, items: [it] });
    }
  }
  for (const l of lines) l.items.sort((a, b) => a.x - b.x);
  return lines;
}

function lineText(line: Line): string {
  return line.items
    .map((i) => i.str)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function leftText(line: Line, threshold: number): string {
  return line.items
    .filter((i) => i.x < threshold)
    .map((i) => i.str)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function joinAddress(parts: string[]): string {
  let out = "";
  for (const raw of parts) {
    const seg = raw.trim();
    if (!seg) continue;
    if (out === "") {
      out = seg;
    } else if (/^[a-z]/.test(seg)) {
      out = out.replace(/\s*$/, "") + seg;
    } else {
      out += " " + seg;
    }
  }
  return out.replace(/\s+/g, " ").trim();
}

const STOP_ADDRESS =
  /(CASHLESS|Berat:|COD:|Batas Kirim|Penjual tidak|^#\b|^Pesan:|INSTANT|Nomor Order|Nomor Telepon|Pengirim)/i;

function parseSpxPage(page: RawPage): ParsedPackage[] {
  const threshold = page.width * 0.47;
  const lines = groupLines(page.items);
  const results: ParsedPackage[] = [];

  const anchors: number[] = [];
  lines.forEach((l, idx) => {
    if (/Kode Pengambilan/i.test(lineText(l))) anchors.push(idx);
  });

  for (let a = 0; a < anchors.length; a++) {
    const start = anchors[a];
    const end = a + 1 < anchors.length ? anchors[a + 1] : lines.length;

    const anchorText = lineText(lines[start]);
    const codeMatch = anchorText.match(/Kode Pengambilan:?\s*([A-Z0-9]{2,})/i);
    const kode = codeMatch ? codeMatch[1].toUpperCase() : "";
    if (!kode) continue;

    let penerima = "";
    let penerimaIdx = -1;
    for (let i = start; i < end; i++) {
      if (/Penerima/i.test(lineText(lines[i]))) {
        const left = leftText(lines[i], threshold);
        penerima = left.replace(/Penerima\s*:?/i, "").trim();
        penerimaIdx = i;
        break;
      }
    }

    const addressParts: string[] = [];
    if (penerimaIdx >= 0) {
      for (let i = penerimaIdx + 1; i < end; i++) {
        const full = lineText(lines[i]);
        if (STOP_ADDRESS.test(full)) break;
        const leftItems = lines[i].items.filter((it) => it.x < threshold);
        if (leftItems.length === 0) continue;
        if (leftItems[0].x > 20) break;
        const left = leftItems
          .map((it) => it.str)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        if (left) addressParts.push(left);
      }
    }

    results.push({
      kode_pickup: kode,
      nama_penerima: penerima,
      alamat: joinAddress(addressParts),
      kurir: "SPX Sameday",
    });
  }

  return results;
}

function parseTiktokPage(page: RawPage): ParsedPackage[] {
  const lines = groupLines(page.items);
  const results: ParsedPackage[] = [];

  const anchors: number[] = [];
  lines.forEach((l, idx) => {
    if (/Kode Pengambilan/i.test(lineText(l))) anchors.push(idx);
  });

  for (let a = 0; a < anchors.length; a++) {
    const start = anchors[a];
    const end = a + 1 < anchors.length ? anchors[a + 1] : lines.length;

    const anchorText = lineText(lines[start]);
    let kode = "";
    const inline = anchorText.match(/Kode Pengambilan:?\s*([A-Z0-9]{2,})/i);
    if (inline) {
      kode = inline[1].toUpperCase();
    } else {
      for (let i = start + 1; i <= start + 2 && i < end; i++) {
        const m = lineText(lines[i]).match(/\b([A-Z0-9]{3,})\b/);
        if (m) {
          kode = m[1].toUpperCase();
          break;
        }
      }
    }
    if (!kode) continue;

    let penerima = "";
    for (let i = start; i < end; i++) {
      const m = lineText(lines[i]).match(/Penerima\s*:?\s*(.+)/i);
      if (m) {
        penerima = m[1].trim();
        break;
      }
    }

    const addressParts: string[] = [];
    let alamatIdx = -1;
    for (let i = start; i < end; i++) {
      if (/Alamat\s*:/i.test(lineText(lines[i]))) {
        alamatIdx = i;
        const after = lineText(lines[i]).replace(/.*Alamat\s*:/i, "").trim();
        if (after) addressParts.push(after);
        break;
      }
    }
    if (alamatIdx >= 0) {
      for (let i = alamatIdx + 1; i < end; i++) {
        const t = lineText(lines[i]);
        if (/Pengirim|Nomor Order|In transit|Product Name/i.test(t)) break;
        addressParts.push(t);
      }
    }

    results.push({
      kode_pickup: kode,
      nama_penerima: penerima,
      alamat: joinAddress(addressParts),
      kurir: "Gojek Instan",
    });
  }

  return results;
}

function detectFormat(page: RawPage): "spx" | "tiktok" | "unknown" {
  const text = page.items.map((i) => i.str).join(" ");
  if (/INSTANT\s*\/\s*SAMEDAY/i.test(text) || /No\.\s*Pesanan/i.test(text)) {
    return "spx";
  }
  if (/Nomor Telepon/i.test(text) || /Alamat\s*:/i.test(text)) {
    return "tiktok";
  }
  return "unknown";
}

export function parseShippingPdf(pages: RawPage[]): ParsedPackage[] {
  const all: ParsedPackage[] = [];
  for (const page of pages) {
    const fmt = detectFormat(page);
    if (fmt === "spx") {
      all.push(...parseSpxPage(page));
    } else if (fmt === "tiktok") {
      all.push(...parseTiktokPage(page));
    }
  }

  const seen = new Set<string>();
  const deduped: ParsedPackage[] = [];
  for (const p of all) {
    if (!p.kode_pickup || seen.has(p.kode_pickup)) continue;
    seen.add(p.kode_pickup);
    deduped.push(p);
  }
  return deduped;
}
