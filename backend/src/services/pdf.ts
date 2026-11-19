// PDF generation with pdf-lib (pure JS, offline): vaccination certificates
// (Section H.7) and tabular monitoring reports (Section K.4 export).
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.39, 0.45, 0.55);
const LINE = rgb(0.8, 0.84, 0.89);
const ACCENT = rgb(0.05, 0.42, 0.37);
const ZEBRA = rgb(0.96, 0.97, 0.98);

/** Standard PDF fonts are WinAnsi-only; map typographic chars and replace the rest. */
export function latin(input: unknown): string {
  return String(input ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

function fit(text: string, font: PDFFont, size: number, maxWidth: number): string {
  let t = latin(text);
  if (font.widthOfTextAtSize(t, size) <= maxWidth) return t;
  while (t.length > 1 && font.widthOfTextAtSize(t + "...", size) > maxWidth) t = t.slice(0, -1);
  return t + "...";
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = latin(text).split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

const fmtDate = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "-");

// ------------------------------------------------------------ certificate ---

export type CertificateInput = {
  certificateNo: string;
  issuedAt: Date;
  verifyUrl: string;
  qrPng: Buffer;
  pet: {
    name: string;
    species: string;
    breed: string | null;
    gender: string;
    color: string | null;
    dateOfBirth: Date | null;
  };
  owner: { fullName: string; municipality: string | null; wardNumber: number | null };
  status: string;
  records: {
    vaccineName: string;
    batchNumber: string;
    administeredDate: Date;
    boosterDueDate: Date | null;
    clinicName: string;
    registrationNumber: string;
    verifiedAt: Date | null;
  }[];
};

export async function vaccinationCertificatePdf(input: CertificateInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(latin(`Vaccination Certificate - ${input.pet.name}`));
  doc.setAuthor("Rabies Track Nepal");
  doc.setCreationDate(input.issuedAt);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const qr = await doc.embedPng(input.qrPng);

  let page = doc.addPage([595.28, 841.89]); // A4 portrait
  const { width, height } = page.getSize();
  const M = 48;

  page.drawRectangle({ x: 0, y: height - 110, width, height: 110, color: ACCENT });
  page.drawText("Rabies Track Nepal", { x: M, y: height - 52, size: 22, font: bold, color: rgb(1, 1, 1) });
  page.drawText("Digital Pet Vaccination Certificate", { x: M, y: height - 76, size: 12, font, color: rgb(0.85, 0.95, 0.93) });
  page.drawText(latin(`Certificate No. ${input.certificateNo}`), { x: M, y: height - 96, size: 9, font, color: rgb(0.85, 0.95, 0.93) });

  page.drawImage(qr, { x: width - M - 110, y: height - 250, width: 110, height: 110 });
  page.drawText("Scan to verify", { x: width - M - 92, y: height - 262, size: 8, font, color: MUTED });

  let y = height - 145;
  const field = (label: string, value: string) => {
    page.drawText(label.toUpperCase(), { x: M, y, size: 8, font: bold, color: MUTED });
    page.drawText(fit(value, font, 11, 300), { x: M + 120, y: y - 1, size: 11, font, color: INK });
    y -= 20;
  };
  field("Pet name", input.pet.name);
  field("Species / breed", `${input.pet.species}${input.pet.breed ? ` / ${input.pet.breed}` : ""}`);
  field("Gender", input.pet.gender);
  field("Colour", input.pet.color ?? "-");
  field("Date of birth", fmtDate(input.pet.dateOfBirth));
  field("Owner", input.owner.fullName);
  field(
    "Municipality / ward",
    [input.owner.municipality, input.owner.wardNumber ? `Ward ${input.owner.wardNumber}` : null].filter(Boolean).join(", ") || "-",
  );
  field("Current status", input.status.replace(/_/g, " "));

  y -= 14;
  page.drawText("Verified vaccination history", { x: M, y, size: 13, font: bold, color: INK });
  y -= 10;

  const cols = [
    { label: "Vaccine", w: 110 },
    { label: "Batch", w: 70 },
    { label: "Given", w: 66 },
    { label: "Booster due", w: 70 },
    { label: "Clinic (reg. no.)", w: 183 },
  ];
  const drawHeader = (p: PDFPage, yy: number) => {
    let x = M;
    p.drawRectangle({ x: M, y: yy - 16, width: width - 2 * M, height: 18, color: ZEBRA });
    for (const c of cols) {
      p.drawText(c.label, { x: x + 4, y: yy - 11, size: 8, font: bold, color: MUTED });
      x += c.w;
    }
    return yy - 18;
  };
  y = drawHeader(page, y);

  if (!input.records.length) {
    y -= 18;
    page.drawText("No veterinarian-verified vaccinations on record.", { x: M + 4, y, size: 10, font, color: MUTED });
  }
  for (const r of input.records) {
    if (y < 110) {
      page = doc.addPage([595.28, 841.89]);
      y = drawHeader(page, page.getSize().height - M);
    }
    y -= 18;
    const cells = [
      r.vaccineName,
      r.batchNumber,
      fmtDate(r.administeredDate),
      fmtDate(r.boosterDueDate),
      `${r.clinicName} (${r.registrationNumber})`,
    ];
    let x = M;
    cells.forEach((c, i) => {
      page.drawText(fit(c, font, 9, cols[i]!.w - 8), { x: x + 4, y, size: 9, font, color: INK });
      x += cols[i]!.w;
    });
    page.drawLine({ start: { x: M, y: y - 5 }, end: { x: width - M, y: y - 5 }, thickness: 0.5, color: LINE });
  }

  const footer = [
    `Issued ${input.issuedAt.toISOString().replace("T", " ").slice(0, 16)} UTC. Only records verified by a registered veterinary clinic are listed.`,
    `Verify online: ${input.verifyUrl}`,
    "This certificate records vaccinations; it is not a diagnosis of the animal's health.",
  ];
  const last = doc.getPages().at(-1)!;
  footer.forEach((line, i) => {
    for (const [j, l] of wrap(line, font, 8, width - 2 * M).entries()) {
      last.drawText(l, { x: M, y: 64 - i * 14 - j * 10, size: 8, font, color: MUTED });
    }
  });
  return doc.save();
}

// ------------------------------------------------------------ table report ---

export type ReportColumn = { header: string; width: number };

export async function tableReportPdf(opts: {
  title: string;
  subtitle: string;
  columns: ReportColumn[];
  rows: string[][];
  generatedAt?: Date;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(latin(opts.title));
  doc.setAuthor("Rabies Track Nepal");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const size: [number, number] = [841.89, 595.28]; // A4 landscape
  const M = 36;
  const totalW = opts.columns.reduce((s, c) => s + c.width, 0);
  const scale = Math.min(1, (size[0] - 2 * M) / totalW);
  const cols = opts.columns.map((c) => ({ ...c, width: c.width * scale }));
  const generatedAt = opts.generatedAt ?? new Date();

  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;
  const newPage = () => {
    page = doc.addPage(size);
    pages.push(page);
    y = size[1] - M;
    page.drawText(latin(opts.title), { x: M, y: y - 14, size: 15, font: bold, color: INK });
    page.drawText(latin(opts.subtitle), { x: M, y: y - 30, size: 9, font, color: MUTED });
    y -= 48;
    let x = M;
    page.drawRectangle({ x: M, y: y - 14, width: size[0] - 2 * M, height: 18, color: ZEBRA });
    for (const c of cols) {
      page.drawText(fit(c.header, bold, 8, c.width - 6), { x: x + 3, y: y - 9, size: 8, font: bold, color: MUTED });
      x += c.width;
    }
    y -= 16;
  };
  newPage();

  opts.rows.forEach((row, idx) => {
    if (y < M + 24) newPage();
    y -= 14;
    if (idx % 2 === 1) page.drawRectangle({ x: M, y: y - 4, width: size[0] - 2 * M, height: 14, color: ZEBRA });
    let x = M;
    row.forEach((cellText, i) => {
      const c = cols[i];
      if (!c) return;
      page.drawText(fit(cellText, font, 8, c.width - 6), { x: x + 3, y, size: 8, font, color: INK });
      x += c.width;
    });
  });
  if (!opts.rows.length) {
    page.drawText("No records match the selected filters.", { x: M, y: y - 18, size: 10, font, color: MUTED });
  }

  pages.forEach((p, i) => {
    p.drawText(
      latin(`Rabies Track Nepal - generated ${generatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC - ${opts.rows.length} records - page ${i + 1} of ${pages.length}`),
      { x: M, y: 18, size: 7, font, color: MUTED },
    );
  });
  return doc.save();
}
