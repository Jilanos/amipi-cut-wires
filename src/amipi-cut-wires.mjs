#!/usr/bin/env node

import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const FALLBACK_APP_ROOT = path.resolve(ROOT, "../electrical-plan-editor");

const DEFAULTS = {
  amipiWorkbook: path.join(ROOT, "data", "Liste cables AMIPI.xlsx"),
  templateWorkbook: path.join(ROOT, "data", "Fdc_CI1250507 Principal CIRCLE.xlsx"),
  exportDirectory: path.join(ROOT, "IN"),
  dataDirectory: path.join(ROOT, "OUT"),
  reportDirectory: path.join(ROOT, "OUT"),
  outputDirectory: path.join(ROOT, "OUT")
};

const APP_TO_AMIPI_COLOR = new Map([
  ["RD", "RG"],
  ["RED", "RG"],
  ["RG", "RG"],
  ["BK", "NR"],
  ["BLACK", "NR"],
  ["NO", "NR"],
  ["NR", "NR"],
  ["GN", "VE"],
  ["GREEN", "VE"],
  ["VT", "VE"],
  ["VE", "VE"],
  ["YE", "JN"],
  ["YELLOW", "JN"],
  ["JA", "JN"],
  ["JN", "JN"],
  ["BU", "BE"],
  ["BLUE", "BE"],
  ["BL", "BE"],
  ["BE", "BE"],
  ["BN", "MR"],
  ["BROWN", "MR"],
  ["MA", "MR"],
  ["MR", "MR"],
  ["OG", "OR"],
  ["ORANGE", "OR"],
  ["OR", "OR"],
  ["VI", "VI"],
  ["VIOLET", "VI"],
  ["PU", "VI"],
  ["BA", "BA"],
  ["WH", "BA"],
  ["WHITE", "BA"],
  ["RS", "RS"],
  ["PK", "RS"],
  ["PINK", "RS"],
  ["GY", "GR"],
  ["GR", "GR"],
  ["GREY", "GR"],
  ["GRAY", "GR"]
]);

const AMIPI_TO_FDC_COLOR = new Map([
  ["NR", "NO"],
  ["JN", "JA"],
  ["MR", "MA"]
]);

const FDC_COLOR_CELL_STYLES = new Map([
  ["NO", { fill: "FF000000", font: "FFFFFFFF" }],
  ["RG", { fill: "FFFF0000", font: "FFFFFFFF" }],
  ["VE", { fill: "FF00B050", font: "FFFFFFFF" }],
  ["JA", { fill: "FFFFFF00", font: "FF000000" }],
  ["BE", { fill: "FF0070C0", font: "FFFFFFFF" }],
  ["MA", { fill: "FF8B4513", font: "FFFFFFFF" }],
  ["OR", { fill: "FFFFC000", font: "FF000000" }],
  ["VI", { fill: "FF7030A0", font: "FFFFFFFF" }],
  ["BA", { fill: "FFFFFFFF", font: "FF000000" }],
  ["RS", { fill: "FFFF99CC", font: "FF000000" }],
  ["GR", { fill: "FFBFBFBF", font: "FF000000" }]
]);

const FDC_TWIST_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFFF00" }
};

const FDC_CELL_BORDER = {
  style: "thin",
  color: { argb: "FF000000" }
};

const SPLICE_ACCESSORY_LABEL = "PREDEN 13MM";

const MANUAL_CABLE_PREFERENCES = new Map([
  ["0.5|GR", "Z000245902"],
  ["0.5|RS", "104604"]
]);

const CUT_BLANK_ROW = 1;
const CUT_HARNESS_TITLE_ROW = 2;
const CUT_GROUP_HEADER_ROW = 3;
const CUT_HEADER_ROW = 4;
const CUT_DATA_START_ROW = 5;
const CUT_COLUMN_COUNT = 22;
const GENERATED_ROW_HEIGHT = 12.9;
const TWIST_PITCH_MM = 13;
const WIRE_EXPORT_UNTWISTED_LENGTH_COLUMN = "Untwisted length (mm)";

const CUT_COLUMNS = {
  designation: 1,
  wireNumber: 2,
  epi: 3,
  section: 4,
  color: 5,
  cable: 6,
  length: 7,
  beginApp: 8,
  beginPin: 9,
  beginConnectionName: 10,
  beginConnectionRef: 11,
  beginSealName: 12,
  beginSealRef: 13,
  endApp: 14,
  endPin: 15,
  endConnectionName: 16,
  endConnectionRef: 17,
  endSealName: 18,
  endSealRef: 19,
  twist: 20,
  comment: 21,
  commentEnd: 22
};

// The harness name is written in F2, above the cable/length area.
const CUT_HARNESS_TITLE_COLUMN = CUT_COLUMNS.cable;

const CUT_HEADERS = new Map([
  [CUT_COLUMNS.designation, "DESIGNATION"],
  [CUT_COLUMNS.wireNumber, "FIL"],
  [CUT_COLUMNS.epi, "EPI"],
  [CUT_COLUMNS.section, "SECT"],
  [CUT_COLUMNS.color, "COULEUR"],
  [CUT_COLUMNS.cable, "CABLE"],
  [CUT_COLUMNS.length, "LONG"],
  [CUT_COLUMNS.beginApp, "APP 1"],
  [CUT_COLUMNS.beginPin, "VOIE 1"],
  [CUT_COLUMNS.beginConnectionName, "Désignation CONNEXION 1 "],
  [CUT_COLUMNS.beginConnectionRef, "CONNEXION 1"],
  [CUT_COLUMNS.beginSealName, "Désignation JOINT 1 "],
  [CUT_COLUMNS.beginSealRef, "JOINT 1"],
  [CUT_COLUMNS.endApp, "APP 2"],
  [CUT_COLUMNS.endPin, "VOIE 2"],
  [CUT_COLUMNS.endConnectionName, "Désignation CONNEXION 2"],
  [CUT_COLUMNS.endConnectionRef, "CONNEXION 2 "],
  [CUT_COLUMNS.endSealName, "Désignation JOINT 2"],
  [CUT_COLUMNS.endSealRef, "JOINT 2 "],
  [CUT_COLUMNS.twist, "TORSADE"],
  [CUT_COLUMNS.comment, "COMMENTAIRE"],
  [CUT_COLUMNS.commentEnd, "COMMENTAIRE"]
]);

// Column widths mirror the supplier sheets, matched by semantic column. DESIGNATION
// and the COMMENTAIRE pair are hidden in the supplier files but kept visible here, so
// they keep a readable width of their own.
const CUT_COLUMN_WIDTHS = new Map([
  [CUT_COLUMNS.designation, 30],
  [CUT_COLUMNS.wireNumber, 3.44],
  [CUT_COLUMNS.epi, 3.44],
  [CUT_COLUMNS.section, 3.11],
  [CUT_COLUMNS.color, 4.66],
  [CUT_COLUMNS.cable, 20.78],
  [CUT_COLUMNS.length, 10.78],
  [CUT_COLUMNS.beginApp, 8.78],
  [CUT_COLUMNS.beginPin, 4.78],
  [CUT_COLUMNS.beginConnectionName, 20.78],
  [CUT_COLUMNS.beginConnectionRef, 10.78],
  [CUT_COLUMNS.beginSealName, 20.78],
  [CUT_COLUMNS.beginSealRef, 10.78],
  [CUT_COLUMNS.endApp, 10.78],
  [CUT_COLUMNS.endPin, 4.78],
  [CUT_COLUMNS.endConnectionName, 22.78],
  [CUT_COLUMNS.endConnectionRef, 10.78],
  [CUT_COLUMNS.endSealName, 20.78],
  [CUT_COLUMNS.endSealRef, 10.78],
  [CUT_COLUMNS.twist, 5.44],
  [CUT_COLUMNS.comment, 18],
  [CUT_COLUMNS.commentEnd, 18]
]);

// Supplier cut sheets vary the font size per column: SECT and COULEUR are set in a
// smaller 6pt, while CABLE and LONG use a larger 10pt. Every other column keeps the
// default 8pt applied by makeDataCellFont / styleCutHeaderCell.
const CUT_COLUMN_FONT_SIZES = new Map([
  [CUT_COLUMNS.section, 6],
  [CUT_COLUMNS.color, 6],
  [CUT_COLUMNS.cable, 10],
  [CUT_COLUMNS.length, 10]
]);

const WIRE_EXPORT_REQUIRED_COLUMNS = ["Name", "Technical ID", "Color", "Begin ID", "Begin pin", "End ID", "End pin", "Section (mm²)", "Length (mm)"];

const WIRE_EXPORT_COLUMN_ALIASES = new Map([
  ["Begin ID", ["Begin ref"]],
  ["End ID", ["End ref"]]
]);

const PRIORITY_CABLE_PATTERN = /\bIR\s+T2\s+SPB\b/i;

function makeRequireFrom(candidateRoot) {
  return createRequire(path.join(candidateRoot, "package.json"));
}

async function loadExcelJS() {
  const attempts = [
    () => import("exceljs"),
    () => Promise.resolve(makeRequireFrom(ROOT)("exceljs")),
    () => Promise.resolve(makeRequireFrom(FALLBACK_APP_ROOT)("exceljs"))
  ];

  for (const attempt of attempts) {
    try {
      const loaded = await attempt();
      return loaded.default ?? loaded;
    } catch {
      // Try next resolution root.
    }
  }

  throw new Error("Unable to load exceljs. Run `npm install` in this directory or keep electrical-plan-editor/node_modules available.");
}

function ensureDirectory(directory) {
  mkdirSync(directory, { recursive: true });
}

function stringifyJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function cellText(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    if ("text" in value && value.text !== undefined) {
      return String(value.text);
    }
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => String(part.text ?? "")).join("");
    }
    if ("result" in value && value.result !== undefined) {
      return String(value.result);
    }
    if ("formula" in value && value.formula !== undefined) {
      return String(value.result ?? "");
    }
    return "";
  }
  return String(value);
}

function normalizeText(value) {
  return cellText(value).replace(/\uFEFF/g, "").replace(/\s+/g, " ").trim();
}

function normalizeReference(value) {
  return normalizeText(value);
}

function parseNumber(value) {
  const normalized = normalizeText(value).replace(",", ".");
  if (normalized.length === 0) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatSectionKey(sectionMm2) {
  return Number(sectionMm2).toString();
}

function makeCableKey(sectionMm2, colorCode) {
  return `${formatSectionKey(sectionMm2)}|${colorCode}`;
}

function stripDiacritics(value) {
  return normalizeText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function deriveHarnessName(sheetName, sourceFile = "") {
  const sheetBase = stripDiacritics(sheetName)
    .replace(/\bWires?\b/gi, "")
    .replace(/\bwire-list\b/gi, "")
    .replace(/[_\s-]+$/g, "")
    .trim();
  const fallbackBase = stripDiacritics(path.basename(sourceFile, path.extname(sourceFile)))
    .replace(/^wire-list[-_\s]*/i, "")
    .replace(/[-_\s]*\d{4}[-_]\d{2}[-_]\d{2}.*$/i, "")
    .trim();
  const base = sheetBase.length > 0 ? sheetBase : fallbackBase;
  const normalized = base
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return normalized.length > 0 ? normalized : "FAISCEAU";
}

function collectWireSpliceIds(wire) {
  return [
    normalizeText(wire["Begin ID"]),
    normalizeText(wire["End ID"])
  ].filter((endpointId) => isSpliceEndpoint(endpointId));
}

function formatEpiValue(wire) {
  return [...new Set(collectWireSpliceIds(wire))].join(" / ");
}

function parseAmipiDesignation(designation) {
  const raw = normalizeText(designation);
  const match = raw.match(/^CABLE\s+(\d+(?:[,.]\d+)?)\s+([A-Z]{2})(?:\s+|$)(.*)$/i);
  if (match === null) {
    return null;
  }
  return {
    sectionMm2: Number(match[1].replace(",", ".")),
    colorCode: match[2].toUpperCase(),
    details: match[3].trim(),
    raw
  };
}

function isPriorityCable(cable) {
  return cable.sectionMm2 >= 0.5 && PRIORITY_CABLE_PATTERN.test(cable.designation);
}

function priorityCableRank(cable) {
  const hasEsMarker = /\bES\b/i.test(cable.designation);
  return [
    hasEsMarker ? 1 : 0,
    cable.stock === null ? 1 : 0,
    -(cable.stock ?? 0),
    cable.sourceRow
  ];
}

function comparePriorityCables(first, second) {
  const firstRank = priorityCableRank(first);
  const secondRank = priorityCableRank(second);
  for (let index = 0; index < firstRank.length; index += 1) {
    if (firstRank[index] !== secondRank[index]) {
      return firstRank[index] - secondRank[index];
    }
  }
  return first.reference.localeCompare(second.reference);
}

function buildPriorityCablePreferences(catalog) {
  const byKey = new Map();
  for (const cable of catalog.cables) {
    if (!isPriorityCable(cable)) {
      continue;
    }
    const matches = byKey.get(cable.normalizedKey) ?? [];
    matches.push(cable);
    byKey.set(cable.normalizedKey, matches);
  }

  const preferences = {};
  const rows = [];
  for (const [key, matches] of byKey) {
    const sortedMatches = [...matches].sort(comparePriorityCables);
    const selected = sortedMatches[0];
    preferences[key] = selected.reference;
    rows.push({
      key,
      sectionMm2: selected.sectionMm2,
      colorCode: selected.colorCode,
      reference: selected.reference,
      designation: selected.designation,
      stock: selected.stock,
      sourceSheet: selected.sourceSheet,
      sourceRow: selected.sourceRow,
      alternatives: sortedMatches.slice(1).map((match) => ({
        reference: match.reference,
        designation: match.designation,
        stock: match.stock,
        sourceSheet: match.sourceSheet,
        sourceRow: match.sourceRow
      }))
    });
  }

  rows.sort((first, second) => first.sectionMm2 - second.sectionMm2 || first.colorCode.localeCompare(second.colorCode));
  return { preferences, rows };
}

function normalizeExportColor(rawColor) {
  const raw = normalizeText(rawColor);
  if (raw.length === 0) {
    return { ok: false, raw, reason: "missing-color" };
  }
  if (/^free\s*:/i.test(raw)) {
    return { ok: false, raw, reason: "free-color" };
  }

  const normalized = raw.toUpperCase().replace(/\s+/g, "");
  const separator = normalized.includes("/") ? "/" : normalized.includes("-") ? "-" : null;
  if (separator !== null) {
    const parts = normalized.split(separator).filter(Boolean);
    const mapped = parts.map((part) => APP_TO_AMIPI_COLOR.get(part));
    if (mapped.some((part) => part === undefined)) {
      return { ok: false, raw, reason: "unknown-color" };
    }
    return { ok: true, raw, colorCode: mapped.join("/") };
  }

  const mapped = APP_TO_AMIPI_COLOR.get(normalized);
  if (mapped === undefined) {
    return { ok: false, raw, reason: "unknown-color" };
  }
  return { ok: true, raw, colorCode: mapped };
}

function normalizeFdcColor(rawColor) {
  const raw = normalizeText(rawColor);
  if (raw.length === 0) {
    return { ok: false, raw, reason: "missing-color" };
  }

  const parts = raw.toUpperCase().replace(/\s+/g, "").split("/").filter(Boolean);
  const mapped = parts.map((part) => APP_TO_AMIPI_COLOR.get(part) ?? part);
  if (mapped.length === 0 || mapped.some((part) => part.length === 0)) {
    return { ok: false, raw, reason: "unknown-color" };
  }
  return { ok: true, raw, colorCode: mapped.join("/") };
}

function formatFdcColor(colorCode) {
  return colorCode
    .split("/")
    .map((part) => AMIPI_TO_FDC_COLOR.get(part) ?? part)
    .join("/");
}

function getFdcColorCellStyle(colorText) {
  const firstColorCode = normalizeText(colorText).toUpperCase().split("/").find(Boolean);
  return firstColorCode === undefined ? undefined : FDC_COLOR_CELL_STYLES.get(firstColorCode);
}

function applyFdcColorCellStyle(cell, colorText) {
  const colorStyle = getFdcColorCellStyle(colorText);
  if (colorStyle === undefined) {
    return;
  }

  cell.style = {
    ...cloneCellStyleObject(cell),
    fill: {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: colorStyle.fill }
    },
    font: {
      ...(cell.font ?? {}),
      color: { argb: colorStyle.font }
    }
  };
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === "\"") {
        if (text[index + 1] === "\"") {
          cell += "\"";
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }

  if (inQuotes) {
    throw new Error("CSV contains an unterminated quoted cell.");
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((candidate) => candidate.some((value) => value.trim().length > 0));
}

function buildHeaderIndex(headers) {
  const index = new Map();
  headers.forEach((header, position) => {
    index.set(normalizeText(header), position);
  });
  return index;
}

function requireColumn(headerIndex, name, source) {
  const index = headerIndex.get(name);
  if (index === undefined) {
    throw new Error(`${source}: missing required column '${name}'.`);
  }
  return index;
}

function splitReferenceAndName(value) {
  const text = normalizeText(value);
  if (text.length === 0) {
    return { reference: "", name: "" };
  }
  const separatorIndex = text.indexOf(" - ");
  if (separatorIndex === -1) {
    return { reference: text, name: "" };
  }
  return {
    reference: text.slice(0, separatorIndex).trim(),
    name: text.slice(separatorIndex + 3).trim()
  };
}

function readReferenceAndName(row, referenceColumn, nameColumn) {
  const reference = normalizeReference(row[referenceColumn]);
  const name = normalizeText(row[nameColumn]);
  if (name.length > 0) {
    return { reference, name };
  }
  return splitReferenceAndName(reference);
}

function normalizePin(value) {
  const text = normalizeText(value);
  const cavity = text.match(/^C(\d+)$/i);
  return cavity === null ? text : cavity[1];
}

// A splice endpoint ID carries its tag as a dash-delimited segment followed by a
// number: `EP` (e.g. LAT-EP-01), `S` (e.g. PRI-S-01 or bare S-001), or `E`
// (e.g. PRI-E-01). Connectors use the `C` tag and must not match.
const SPLICE_ENDPOINT_PATTERN = /(?:^|[-_\s])(?:EP|S|E)[-_]\d/i;

function isSpliceEndpoint(value) {
  return SPLICE_ENDPOINT_PATTERN.test(normalizeText(value));
}

function columnLetterToNumber(columnLetter) {
  return [...columnLetter.toUpperCase()].reduce((value, char) => value * 26 + char.charCodeAt(0) - 64, 0);
}

function parseCellRange(range) {
  const match = String(range).match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
  if (match === null) {
    return null;
  }
  return {
    startColumn: columnLetterToNumber(match[1]),
    startRow: Number(match[2]),
    endColumn: columnLetterToNumber(match[3]),
    endRow: Number(match[4])
  };
}

function rangesOverlap(firstStart, firstEnd, secondStart, secondEnd) {
  return firstStart <= secondEnd && secondStart <= firstEnd;
}

function unmergeColumnRanges(worksheet, startColumn, endColumn) {
  for (const range of [...(worksheet.model.merges ?? [])]) {
    const parsed = parseCellRange(range);
    if (parsed === null) {
      continue;
    }
    if (rangesOverlap(parsed.startColumn, parsed.endColumn, startColumn, endColumn)) {
      worksheet.unMergeCells(range);
    }
  }
}

function unmergeAllRanges(worksheet) {
  for (const range of [...(worksheet.model.merges ?? [])]) {
    worksheet.unMergeCells(range);
  }
}

function unmergeAccessoryRanges(worksheet) {
  for (const range of [...(worksheet.model.merges ?? [])]) {
    const parsed = parseCellRange(range);
    if (parsed === null || parsed.endRow < 2) {
      continue;
    }
    const overlapsBeginAccessory = rangesOverlap(parsed.startColumn, parsed.endColumn, 10, 13);
    const overlapsEndAccessory = rangesOverlap(parsed.startColumn, parsed.endColumn, 17, 21);
    if (overlapsBeginAccessory || overlapsEndAccessory) {
      worksheet.unMergeCells(range);
    }
  }
}

function removeWorksheetNotes(worksheet) {
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell._comment = undefined;
    });
  });
}

function sanitizeWorksheetName(name, fallback) {
  const sanitized = normalizeText(name)
    .replace(/[\[\]:*?/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (sanitized.length === 0 ? fallback : sanitized).slice(0, 31);
}

function makeUniqueWorksheetName(workbook, requestedName) {
  const baseName = sanitizeWorksheetName(requestedName, "Feuille de coupe");
  let candidate = baseName;
  let suffix = 2;
  while (workbook.getWorksheet(candidate) !== undefined) {
    const suffixText = ` ${suffix}`;
    candidate = `${baseName.slice(0, 31 - suffixText.length)}${suffixText}`;
    suffix += 1;
  }
  return candidate;
}

async function readWorkbook(ExcelJS, filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  return workbook;
}

async function readAmipiCatalog(ExcelJS, filePath) {
  const workbook = await readWorkbook(ExcelJS, filePath);
  const worksheet = workbook.getWorksheet("CABLE165") ?? workbook.worksheets[0];
  const cables = [];
  const ignoredRows = [];

  for (let rowNumber = 6; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const factory = normalizeText(row.getCell(1).value);
    const reference = normalizeReference(row.getCell(2).value);
    const designation = normalizeText(row.getCell(3).value);
    const stock = parseNumber(row.getCell(4).value);

    if (reference.length === 0 && designation.length === 0) {
      continue;
    }

    const parsed = parseAmipiDesignation(designation);
    if (reference.length === 0 || parsed === null || !Number.isFinite(parsed.sectionMm2)) {
      ignoredRows.push({ rowNumber, reference, designation, reason: "unparseable-designation" });
      continue;
    }

    cables.push({
      reference,
      sectionMm2: parsed.sectionMm2,
      colorCode: parsed.colorCode,
      colorKey: parsed.colorCode,
      designation,
      designationDetails: parsed.details,
      factory,
      stock,
      sourceSheet: worksheet.name,
      sourceRow: rowNumber,
      normalizedKey: makeCableKey(parsed.sectionMm2, parsed.colorCode)
    });
  }

  const byKey = new Map();
  for (const cable of cables) {
    const matches = byKey.get(cable.normalizedKey) ?? [];
    matches.push(cable);
    byKey.set(cable.normalizedKey, matches);
  }

  return {
    cables,
    ignoredRows,
    keyStats: {
      totalKeys: byKey.size,
      ambiguousKeys: [...byKey.values()].filter((matches) => matches.length > 1).length
    },
    ambiguities: [...byKey.entries()]
      .filter(([, matches]) => matches.length > 1)
      .map(([key, matches]) => ({
        key,
        sectionMm2: matches[0].sectionMm2,
        colorCode: matches[0].colorCode,
        references: matches.map((match) => ({
          reference: match.reference,
          designation: match.designation,
          stock: match.stock,
          sourceRow: match.sourceRow
        }))
      }))
  };
}

async function readFdcPreferences(ExcelJS, filePath) {
  const workbook = await readWorkbook(ExcelJS, filePath);
  const worksheet = workbook.getWorksheet("Feuille de coupe") ?? workbook.worksheets[0];
  const preferences = {};
  const conflicts = [];
  const rows = [];
  const frequencyByKey = new Map();

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const sectionMm2 = parseNumber(row.getCell(4).value);
    const color = normalizeFdcColor(row.getCell(5).value);
    const reference = normalizeReference(row.getCell(6).value);
    if (sectionMm2 === null || !color.ok || reference.length === 0) {
      continue;
    }
    const colorCode = color.colorCode;
    const key = makeCableKey(sectionMm2, colorCode);
    const references = frequencyByKey.get(key) ?? new Map();
    references.set(reference, (references.get(reference) ?? 0) + 1);
    frequencyByKey.set(key, references);
    if (preferences[key] !== undefined && preferences[key] !== reference) {
      conflicts.push({ key, previousReference: preferences[key], nextReference: reference, rowNumber });
      continue;
    }
    preferences[key] = reference;
    rows.push({
      rowNumber,
      key,
      sectionMm2,
      colorCode,
      rawColorCode: color.raw,
      reference,
      designation: normalizeText(row.getCell(1).value)
    });
  }

  const frequencyPreferences = {};
  const frequencyRows = [];
  for (const [key, references] of frequencyByKey) {
    const ranked = [...references.entries()]
      .map(([reference, count]) => ({ reference, count }))
      .sort((first, second) => second.count - first.count || first.reference.localeCompare(second.reference));
    const selected = ranked[0];
    frequencyPreferences[key] = selected.reference;
    frequencyRows.push({
      key,
      reference: selected.reference,
      count: selected.count,
      alternatives: ranked.slice(1)
    });
  }

  frequencyRows.sort((first, second) => first.key.localeCompare(second.key, undefined, { numeric: true }));
  return { preferences, conflicts, rows, frequencyPreferences, frequencyRows };
}

function buildResolver(catalog, fdcPreferences) {
  const byKey = new Map();
  const byReference = new Map();
  for (const cable of catalog.cables) {
    const matches = byKey.get(cable.normalizedKey) ?? [];
    matches.push(cable);
    byKey.set(cable.normalizedKey, matches);
    byReference.set(cable.reference, cable);
  }

  function resolve(sectionMm2, colorCode) {
    const key = makeCableKey(sectionMm2, colorCode);
    const matches = byKey.get(key) ?? [];
    const explicitReference = fdcPreferences.explicitPreferences?.[key];
    const expectedFrequencyReference = fdcPreferences.expectedFrequencyPreferences?.[key];
    const priorityReference = fdcPreferences.priorityPreferences?.[key];
    const preferredReference = fdcPreferences.preferences[key];

    if (explicitReference !== undefined) {
      const explicitCable = byReference.get(explicitReference);
      return {
        status: explicitCable === undefined ? "explicit-reference-not-in-catalog" : "resolved-by-explicit-preference",
        key,
        reference: explicitReference,
        cable: explicitCable ?? null,
        candidates: matches
      };
    }

    if (expectedFrequencyReference !== undefined) {
      const expectedFrequencyCable = byReference.get(expectedFrequencyReference);
      return {
        status: expectedFrequencyCable === undefined ? "expected-frequency-reference-not-in-catalog" : "resolved-by-expected-frequency",
        key,
        reference: expectedFrequencyReference,
        cable: expectedFrequencyCable ?? null,
        candidates: matches
      };
    }

    if (preferredReference !== undefined) {
      const preferredCable = byReference.get(preferredReference);
      return {
        status: preferredCable === undefined ? "preferred-reference-not-in-catalog" : "resolved-by-fdc-preference",
        key,
        reference: preferredReference,
        cable: preferredCable ?? null,
        candidates: matches
      };
    }

    if (priorityReference !== undefined) {
      const priorityCable = byReference.get(priorityReference);
      return {
        status: priorityCable === undefined ? "priority-reference-not-in-catalog" : "resolved-by-priority-cable",
        key,
        reference: priorityReference,
        cable: priorityCable ?? null,
        candidates: matches
      };
    }

    if (matches.length === 1) {
      return {
        status: "resolved-unique",
        key,
        reference: matches[0].reference,
        cable: matches[0],
        candidates: matches
      };
    }

    if (matches.length > 1) {
      return {
        status: "ambiguous",
        key,
        reference: null,
        cable: null,
        candidates: matches
      };
    }

    return {
      status: "missing",
      key,
      reference: null,
      cable: null,
      candidates: []
    };
  }

  return { resolve };
}

async function readWireExportXlsx(ExcelJS, filePath) {
  const workbook = await readWorkbook(ExcelJS, filePath);
  const sheets = [];

  for (const worksheet of workbook.worksheets) {
    const headers = [];
    const headerRow = worksheet.getRow(1);
    for (let column = 1; column <= worksheet.columnCount; column += 1) {
      headers.push(normalizeText(headerRow.getCell(column).value));
    }
    if (headers.every((header) => header.length === 0)) {
      continue;
    }

    const headerIndex = buildHeaderIndex(headers);
    const spliceNamesById = readEntitySpliceNames(worksheet, headerIndex);
    const rows = [];
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const values = headers.map((header, index) => [header, normalizeText(row.getCell(index + 1).value)]);
      if (values.every(([, value]) => value.length === 0)) {
        continue;
      }
      rows.push(Object.fromEntries(values));
    }

    sheets.push({ name: worksheet.name, headers, headerIndex, rows, spliceNamesById });
  }

  return { sheets };
}

function readEntitySpliceNames(worksheet, headerIndex) {
  const entityTypeColumn = headerIndex.get("Entity type");
  const entityIdColumn = headerIndex.get("Entity ID");
  const entityNameColumn = headerIndex.get("Entity name");
  const spliceNamesById = {};
  if (entityTypeColumn === undefined || entityIdColumn === undefined || entityNameColumn === undefined) {
    return spliceNamesById;
  }

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const entityType = normalizeText(row.getCell(entityTypeColumn + 1).value);
    if (entityType.toLowerCase() !== "splice") {
      continue;
    }
    const entityId = normalizeText(row.getCell(entityIdColumn + 1).value);
    const entityName = normalizeText(row.getCell(entityNameColumn + 1).value);
    if (entityId.length > 0 && entityName.length > 0) {
      spliceNamesById[entityId] = entityName;
    }
  }
  return spliceNamesById;
}

async function readWireExportCsv(filePath) {
  const rows = parseCsvRows(readFileSync(filePath, "utf8"));
  if (rows.length === 0) {
    throw new Error(`${filePath}: empty CSV.`);
  }
  rows[0][0] = rows[0][0].replace(/^\uFEFF/, "");
  const headers = rows[0].map(normalizeText);
  const headerIndex = buildHeaderIndex(headers);
  return {
    sheets: [
      {
        name: path.basename(filePath, path.extname(filePath)),
        headers,
        headerIndex,
        rows: rows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, normalizeText(row[index] ?? "")]))),
        spliceNamesById: {}
      }
    ]
  };
}

async function readWireExport(ExcelJS, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const parsed = extension === ".xlsx" ? await readWireExportXlsx(ExcelJS, filePath) : await readWireExportCsv(filePath);
  if (parsed.sheets.length === 0) {
    throw new Error(`${filePath}: no readable worksheet found.`);
  }
  for (const sheet of parsed.sheets) {
    for (const [column, aliases] of WIRE_EXPORT_COLUMN_ALIASES) {
      if (sheet.headerIndex.has(column)) {
        continue;
      }
      const alias = aliases.find((candidate) => sheet.headerIndex.has(candidate));
      if (alias === undefined) {
        continue;
      }
      sheet.headerIndex.set(column, sheet.headerIndex.get(alias));
      for (const row of sheet.rows) {
        row[column] = row[alias] ?? "";
      }
    }

    for (const column of WIRE_EXPORT_REQUIRED_COLUMNS) {
      requireColumn(sheet.headerIndex, column, `${filePath}:${sheet.name}`);
    }
    sheet.rows = sheet.rows.filter((row) => WIRE_EXPORT_REQUIRED_COLUMNS.some((column) => normalizeText(row[column]).length > 0));
  }
  return parsed;
}

function resolveWireRows(filePath, sheetName, rows, resolver) {
  return rows.map((row, index) => {
    const sourceRow = index + 2;
    const sectionMm2 = parseNumber(row["Section (mm²)"]);
    const color = normalizeExportColor(row.Color);
    if (sectionMm2 === null) {
      return {
        sourceFile: filePath,
        sourceSheet: sheetName,
        sourceRow,
        wire: row,
        status: "unresolved",
        reason: "invalid-section",
        sectionMm2: null,
        color
      };
    }
    if (!color.ok) {
      return {
        sourceFile: filePath,
        sourceSheet: sheetName,
        sourceRow,
        wire: row,
        status: "unresolved",
        reason: color.reason,
        sectionMm2,
        color
      };
    }

    const resolution = resolver.resolve(sectionMm2, color.colorCode);
    return {
      sourceFile: filePath,
      sourceSheet: sheetName,
      sourceRow,
      wire: row,
      status: resolution.reference === null ? "unresolved" : "resolved",
      reason: resolution.status,
      sectionMm2,
      color,
      normalizedKey: resolution.key,
      cableReference: resolution.reference,
      candidates: resolution.candidates.map((candidate) => ({
        reference: candidate.reference,
        designation: candidate.designation,
        stock: candidate.stock,
        sourceRow: candidate.sourceRow
      }))
    };
  });
}

function listWireExportFiles(directory) {
  return readdirSync(directory)
    .filter((fileName) => !fileName.endsWith(":Zone.Identifier"))
    .filter((fileName) => !fileName.startsWith("~$"))
    .filter((fileName) => [".csv", ".xlsx"].includes(path.extname(fileName).toLowerCase()))
    .sort()
    .map((fileName) => path.join(directory, fileName));
}

function summarizeResolutions(resolutions) {
  const summary = {
    totalRows: resolutions.length,
    resolvedRows: 0,
    unresolvedRows: 0,
    byReason: {}
  };

  for (const resolution of resolutions) {
    if (resolution.status === "resolved") {
      summary.resolvedRows += 1;
    } else {
      summary.unresolvedRows += 1;
    }
    summary.byReason[resolution.reason] = (summary.byReason[resolution.reason] ?? 0) + 1;
  }
  return summary;
}

function cloneCellFill(cell) {
  return JSON.parse(JSON.stringify(cell.fill ?? {}));
}

function cloneCellFont(cell) {
  return JSON.parse(JSON.stringify(cell.font ?? {}));
}

function cloneCellStyleObject(cell) {
  return JSON.parse(JSON.stringify(cell.style ?? {}));
}

function applyClonedFill(targetCell, fill) {
  targetCell.style = {
    ...cloneCellStyleObject(targetCell),
    fill: JSON.parse(JSON.stringify(fill))
  };
}

function applyClonedFont(targetCell, font) {
  targetCell.style = {
    ...cloneCellStyleObject(targetCell),
    font: JSON.parse(JSON.stringify(font))
  };
}

function clearCellFill(cell) {
  const style = cloneCellStyleObject(cell);
  delete style.fill;
  cell.style = style;
}

function clearTextPrefixMetadata(cell) {
  const style = cloneCellStyleObject(cell);
  delete style.quotePrefix;
  cell.style = style;
  cell.quotePrefix = false;
}

function pairIsEmpty(firstValue, secondValue) {
  return normalizeText(firstValue).length === 0 && normalizeText(secondValue).length === 0;
}

function makeHatchedFill(baseFill) {
  const normalized = JSON.parse(JSON.stringify(baseFill ?? {}));
  const color = normalized.fgColor ?? normalized.bgColor;
  return {
    type: "pattern",
    pattern: "lightDown",
    ...(color === undefined ? {} : { bgColor: color })
  };
}

function applyPairHatchIfEmpty(row, firstColumn, secondColumn) {
  if (!pairIsEmpty(row.getCell(firstColumn).value, row.getCell(secondColumn).value)) {
    return;
  }
  const firstCell = row.getCell(firstColumn);
  const secondCell = row.getCell(secondColumn);
  applyClonedFill(firstCell, makeHatchedFill(firstCell.fill));
  applyClonedFill(secondCell, makeHatchedFill(secondCell.fill));
}

function excelCellValue(value) {
  const text = normalizeText(value);
  if (/^(0|[1-9]\d*)$/.test(text)) {
    const numericValue = Number(text);
    if (Number.isSafeInteger(numericValue)) {
      return numericValue;
    }
  }
  return value;
}

function normalizeTwistGroupLabel(value) {
  return normalizeText(value).replace(/^'+/, "");
}

function excelTwistGroupValue(value) {
  const label = normalizeTwistGroupLabel(value);
  if (/^(0|[1-9]\d*)$/.test(label)) {
    const numericValue = Number(label);
    if (Number.isSafeInteger(numericValue)) {
      return numericValue;
    }
  }
  return label;
}

function formatTwistComment(untwistedLengthMm) {
  if (!Number.isFinite(untwistedLengthMm) || untwistedLengthMm <= 0) {
    return "";
  }
  return `Apres torsade: ${Math.round(untwistedLengthMm)} mm (pas ${TWIST_PITCH_MM} mm)`;
}

function readUntwistedLengthMm(wire) {
  const untwistedLengthMm = parseNumber(wire[WIRE_EXPORT_UNTWISTED_LENGTH_COLUMN]);
  if (untwistedLengthMm === null) {
    return null;
  }
  return untwistedLengthMm;
}

function makeCalibriFont(sourceFont = {}) {
  return {
    ...sourceFont,
    name: "Calibri",
    family: 2,
    size: 8,
    color: { argb: "FF000000" },
    bold: false
  };
}

function makeDataCellFont(sourceFont = {}) {
  return {
    ...sourceFont,
    name: "Calibri",
    family: 2,
    size: 8
  };
}

function makeSpliceFont(sourceFont = {}) {
  return {
    ...sourceFont,
    name: "Times New Roman",
    family: 1,
    size: 8,
    bold: true
  };
}

function applyAccessoryBandStyle(row, column, fill) {
  const cell = row.getCell(column);
  cell.style = {
    ...cloneCellStyleObject(cell),
    fill: JSON.parse(JSON.stringify(fill)),
    font: makeCalibriFont(cell.font ?? {})
  };
}

function applyAccessoryStyles(row, accessoryStyles) {
  for (let column = CUT_COLUMNS.beginApp; column <= CUT_COLUMNS.beginSealRef; column += 1) {
    applyAccessoryBandStyle(row, column, accessoryStyles.beginFill);
  }
  for (let column = CUT_COLUMNS.endApp; column <= CUT_COLUMNS.endSealRef; column += 1) {
    applyAccessoryBandStyle(row, column, accessoryStyles.endFill);
  }
}

function applyEmptyPairHatches(row, accessoryStyles) {
  applyPairHatchIfEmpty(row, CUT_COLUMNS.beginConnectionName, CUT_COLUMNS.beginConnectionRef);
  applyPairHatchIfEmpty(row, CUT_COLUMNS.beginSealName, CUT_COLUMNS.beginSealRef);
  applyPairHatchIfEmpty(row, CUT_COLUMNS.endConnectionName, CUT_COLUMNS.endConnectionRef);
  applyPairHatchIfEmpty(row, CUT_COLUMNS.endSealName, CUT_COLUMNS.endSealRef);
}

function setCellBorderSide(cell, side, border) {
  cell.border = {
    ...(cell.border ?? {}),
    [side]: cloneJson(border)
  };
}

function applyCutSheetEndpointSeparator(worksheet) {
  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    setCellBorderSide(row.getCell(CUT_COLUMNS.beginSealRef), "right", FDC_CELL_BORDER);
    setCellBorderSide(row.getCell(CUT_COLUMNS.endApp), "left", FDC_CELL_BORDER);
  }
}

function applyCutSheetDataFont(worksheet) {
  for (let rowNumber = CUT_DATA_START_ROW; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    for (let column = 1; column <= CUT_COLUMN_COUNT; column += 1) {
      const cell = row.getCell(column);
      styleCutDataCell(cell);
    }
  }
}

function fillEndpointAccessoryCells(row, columns, isSplice, connection, seal) {
  const allColumns = [
    columns.connectionName,
    columns.connectionRef,
    ...(columns.supplierContactRef === undefined ? [] : [columns.supplierContactRef]),
    columns.sealName,
    columns.sealRef
  ];
  if (isSplice) {
    for (const column of allColumns) {
      const cell = row.getCell(column);
      cell.value = null;
      cell.font = makeSpliceFont(cell.font ?? {});
      cell.alignment = { ...(cell.alignment ?? {}), horizontal: "center", vertical: "middle" };
    }
    row.getCell(columns.connectionName).value = SPLICE_ACCESSORY_LABEL;
    try {
      row.worksheet.mergeCells(row.number, allColumns[0], row.number, allColumns[allColumns.length - 1]);
    } catch (error) {
      throw new Error(`Unable to merge splice cells row ${row.number}, columns ${allColumns[0]}-${allColumns[allColumns.length - 1]} on worksheet '${row.worksheet.name}': ${error instanceof Error ? error.message : error}`);
    }
    return;
  }

  row.getCell(columns.connectionName).value = excelCellValue(connection.name);
  row.getCell(columns.connectionRef).value = excelCellValue(connection.reference);
  if (columns.supplierContactRef !== undefined) {
    row.getCell(columns.supplierContactRef).value = "";
  }
  row.getCell(columns.sealName).value = excelCellValue(seal.name);
  row.getCell(columns.sealRef).value = excelCellValue(seal.reference);
}

function fillFdcRow(row, wireNumber, resolution, accessoryStyles) {
  const wire = resolution.wire;
  const beginConnection = readReferenceAndName(wire, "Begin connection ref", "Begin connection name");
  const beginSeal = readReferenceAndName(wire, "Begin seal ref", "Begin seal name");
  const endConnection = readReferenceAndName(wire, "End connection ref", "End connection name");
  const endSeal = readReferenceAndName(wire, "End seal ref", "End seal name");
  const beginIsSplice = isSpliceEndpoint(wire["Begin ID"]);
  const endIsSplice = isSpliceEndpoint(wire["End ID"]);
  const twistValue = excelTwistGroupValue(wire["Twist group"]);
  const twistLabel = normalizeText(twistValue);

  row.getCell(CUT_COLUMNS.designation).value = wire.Name;
  row.getCell(CUT_COLUMNS.wireNumber).value = parseTechnicalIdWireNumber(wire["Technical ID"]) ?? wireNumber;
  row.getCell(CUT_COLUMNS.epi).value = (resolution.epiValues ?? []).join(" / ");
  row.getCell(CUT_COLUMNS.section).value = resolution.sectionMm2;
  const colorDisplay = resolution.color.ok ? formatFdcColor(resolution.color.colorCode) : resolution.color.raw;
  row.getCell(CUT_COLUMNS.color).value = colorDisplay;
  applyFdcColorCellStyle(row.getCell(CUT_COLUMNS.color), colorDisplay);
  row.getCell(CUT_COLUMNS.cable).value = excelCellValue(resolution.cableReference ?? "");
  row.getCell(CUT_COLUMNS.length).value = parseNumber(wire["Length (mm)"]) ?? wire["Length (mm)"];
  row.getCell(CUT_COLUMNS.beginApp).value = wire["Begin ID"];
  row.getCell(CUT_COLUMNS.beginPin).value = excelCellValue(normalizePin(wire["Begin pin"]));
  applyAccessoryStyles(row, accessoryStyles);
  fillEndpointAccessoryCells(row, {
    connectionName: CUT_COLUMNS.beginConnectionName,
    connectionRef: CUT_COLUMNS.beginConnectionRef,
    sealName: CUT_COLUMNS.beginSealName,
    sealRef: CUT_COLUMNS.beginSealRef
  }, beginIsSplice, beginConnection, beginSeal);
  row.getCell(CUT_COLUMNS.endApp).value = wire["End ID"];
  row.getCell(CUT_COLUMNS.endPin).value = excelCellValue(normalizePin(wire["End pin"]));
  fillEndpointAccessoryCells(row, {
    connectionName: CUT_COLUMNS.endConnectionName,
    connectionRef: CUT_COLUMNS.endConnectionRef,
    sealName: CUT_COLUMNS.endSealName,
    sealRef: CUT_COLUMNS.endSealRef
  }, endIsSplice, endConnection, endSeal);
  applyEmptyPairHatches(row, accessoryStyles);
  const twistCell = row.getCell(CUT_COLUMNS.twist);
  twistCell.value = twistValue;
  clearTextPrefixMetadata(twistCell);
  if (twistLabel.length > 0) {
    twistCell.fill = cloneJson(FDC_TWIST_FILL);
  } else {
    clearCellFill(twistCell);
  }
  const commentParts = [];
  if (resolution.status !== "resolved") {
    commentParts.push(`UNRESOLVED: ${resolution.reason}`);
  }
  if (twistLabel.length > 0) {
    const twistComment = formatTwistComment(readUntwistedLengthMm(wire));
    if (twistComment.length > 0) {
      commentParts.push(twistComment);
    }
  }
  row.getCell(CUT_COLUMNS.comment).value = commentParts.join(" | ");
  row.getCell(CUT_COLUMNS.commentEnd).value = row.getCell(CUT_COLUMNS.comment).value;
  for (let column = 1; column <= CUT_COLUMN_COUNT; column += 1) {
    const cell = row.getCell(column);
    cell.font = makeDataCellFont(cell.font ?? {});
  }
}

function copyRowStyle(sourceRow, targetRow) {
  targetRow.height = sourceRow.height;
  sourceRow.eachCell({ includeEmpty: true }, (sourceCell, columnNumber) => {
    const targetCell = targetRow.getCell(columnNumber);
    targetCell.style = JSON.parse(JSON.stringify(sourceCell.style ?? {}));
    if (sourceCell.numFmt !== undefined) {
      targetCell.numFmt = sourceCell.numFmt;
    }
  });
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function cloneExcelValue(value) {
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  if (value !== null && typeof value === "object") {
    return JSON.parse(JSON.stringify(value));
  }
  return value;
}

function copyWorksheetTemplate(workbook, sourceWorksheet, name) {
  const worksheet = workbook.addWorksheet(name, {
    properties: cloneJson(sourceWorksheet.properties),
    pageSetup: cloneJson(sourceWorksheet.pageSetup),
    views: cloneJson(sourceWorksheet.views)
  });
  worksheet.state = sourceWorksheet.state;
  worksheet.pageMargins = cloneJson(sourceWorksheet.pageMargins);
  worksheet.headerFooter = cloneJson(sourceWorksheet.headerFooter);
  worksheet.autoFilter = sourceWorksheet.autoFilter === undefined ? undefined : cloneJson(sourceWorksheet.autoFilter);
  worksheet.columns = sourceWorksheet.columns.map((sourceColumn) => ({
    key: sourceColumn.key,
    width: sourceColumn.width,
    hidden: sourceColumn.hidden,
    outlineLevel: sourceColumn.outlineLevel,
    style: cloneJson(sourceColumn.style)
  }));

  for (let rowNumber = 1; rowNumber <= sourceWorksheet.rowCount; rowNumber += 1) {
    const sourceRow = sourceWorksheet.getRow(rowNumber);
    const targetRow = worksheet.getRow(rowNumber);
    targetRow.height = sourceRow.height;
    targetRow.hidden = sourceRow.hidden;
    targetRow.outlineLevel = sourceRow.outlineLevel;
    sourceRow.eachCell({ includeEmpty: true }, (sourceCell, columnNumber) => {
      const targetCell = targetRow.getCell(columnNumber);
      const isMergedSlave = sourceCell.isMerged === true
        && sourceCell.master !== undefined
        && sourceCell.master.address !== sourceCell.address;
      if (!isMergedSlave) {
        targetCell.value = cloneExcelValue(sourceCell.value);
      }
      targetCell.style = cloneJson(sourceCell.style);
      if (sourceCell.numFmt !== undefined) {
        targetCell.numFmt = sourceCell.numFmt;
      }
    });
  }

  for (const range of sourceWorksheet.model.merges ?? []) {
    try {
      worksheet.mergeCells(range);
    } catch (error) {
      throw new Error(`Unable to copy merged range ${range} to worksheet '${name}': ${error instanceof Error ? error.message : error}`);
    }
  }

  return worksheet;
}

function mergeIfPossible(worksheet, startRow, startColumn, endRow, endColumn) {
  try {
    worksheet.mergeCells(startRow, startColumn, endRow, endColumn);
  } catch {
    // The caller may be rebuilding a row that already carries compatible merges.
  }
}

function styleCutHeaderCell(cell) {
  // Supplier column headers are white Calibri bold on a uniform dark-blue fill. We
  // set the fill explicitly here so every header cell matches (the template left the
  // FIL column without it).
  cell.font = { ...makeCalibriFont(cell.font ?? {}), bold: true, color: { argb: "FFFFFFFF" } };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cell.border = cloneJson(EPISSURE_TABLE_BORDER);
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF155F82" }
  };
}

// The supplier sheets use Times New Roman (not Calibri) for the EXTREMITE 1 / 2
// band that spans each endpoint group, with no fill and a top/left medium border
// plus a thin light-blue underline, so mirror that here.
const CUT_GROUP_HEADER_BORDER = {
  top: { style: "medium" },
  left: { style: "medium" },
  bottom: { style: "thin", color: { argb: "FF44B3E0" } }
};

function styleCutGroupHeaderCell(cell) {
  cell.font = {
    ...(cell.font ?? {}),
    name: "Times New Roman",
    family: 1,
    size: 10,
    bold: true,
    color: { argb: "FF000000" }
  };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cell.border = cloneJson(CUT_GROUP_HEADER_BORDER);
  clearCellFill(cell);
}

function styleCutTitleCell(cell) {
  cell.font = {
    ...(cell.font ?? {}),
    name: "Times New Roman",
    family: 1,
    size: 10,
    bold: true,
    color: { argb: "FF000000" }
  };
  cell.alignment = { horizontal: "left", vertical: "top" };
  cell.border = {};
  clearCellFill(cell);
}

function styleCutDataCell(cell) {
  const isSpliceAccessoryCell = cell.value === SPLICE_ACCESSORY_LABEL
    || (cell.isMerged === true && cell.master?.value === SPLICE_ACCESSORY_LABEL);
  cell.font = isSpliceAccessoryCell
    ? makeSpliceFont(cell.font ?? {})
    : makeDataCellFont(cell.font ?? {});
  // Preserve any horizontal alignment already set (e.g. centered PREDEN splice cells)
  // while enforcing the shared vertical alignment and wrapping.
  cell.alignment = { ...(cell.alignment ?? {}), vertical: "middle", wrapText: true };
  cell.border = cloneJson(EPISSURE_TABLE_BORDER);
}

function applyCutColumnLayout(worksheet) {
  for (const [column, width] of CUT_COLUMN_WIDTHS) {
    worksheet.getColumn(column).width = width;
  }
}

// Override the per-column font size on the column-header row and every data row so
// SECT/COULEUR/CABLE/LONG match the supplier's sizing while preserving each cell's
// existing font (Calibri, bold flag, colour, fills).
function applyCutColumnFontSizes(worksheet) {
  for (const [column, size] of CUT_COLUMN_FONT_SIZES) {
    for (let rowNumber = CUT_HEADER_ROW; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const cell = worksheet.getRow(rowNumber).getCell(column);
      cell.font = { ...(cell.font ?? {}), size };
    }
  }
}

function applyGeneratedRowHeight(worksheet, endRow) {
  for (let rowNumber = 1; rowNumber <= endRow; rowNumber += 1) {
    worksheet.getRow(rowNumber).height = GENERATED_ROW_HEIGHT;
  }
}

function trimWorksheetModel(worksheet, maxRow, maxColumn) {
  // ExcelJS keeps trailing styled template rows/columns in its internal model even
  // after spliceRows/spliceColumns removes values. Trim those generated tail objects
  // so the written XLSX dimension matches the actual cut sheet.
  if (Array.isArray(worksheet._rows) && worksheet._rows.length > maxRow) {
    worksheet._rows.length = maxRow;
  }
  for (const row of worksheet._rows ?? []) {
    if (row !== undefined && Array.isArray(row._cells) && row._cells.length > maxColumn) {
      row._cells.length = maxColumn;
    }
  }
  if (Array.isArray(worksheet._columns) && worksheet._columns.length > maxColumn) {
    worksheet._columns.length = maxColumn;
  }
}

function prepareCutSheetWorksheet(worksheet) {
  const sourceHeaderRow = worksheet.getRow(1);
  const sourceDataRow = worksheet.getRow(2);

  unmergeAllRanges(worksheet);
  if (worksheet.columnCount > CUT_COLUMN_COUNT) {
    worksheet.spliceColumns(CUT_COLUMN_COUNT + 1, worksheet.columnCount - CUT_COLUMN_COUNT);
  }
  copyRowStyle(sourceDataRow, worksheet.getRow(CUT_DATA_START_ROW));
  copyRowStyle(sourceHeaderRow, worksheet.getRow(CUT_BLANK_ROW));
  copyRowStyle(sourceHeaderRow, worksheet.getRow(CUT_HARNESS_TITLE_ROW));
  copyRowStyle(sourceHeaderRow, worksheet.getRow(CUT_GROUP_HEADER_ROW));
  copyRowStyle(sourceHeaderRow, worksheet.getRow(CUT_HEADER_ROW));

  applyCutColumnLayout(worksheet);

  // Open at the supplier's default zoom (115%) instead of the template's 175%.
  worksheet.views = (worksheet.views ?? [{}]).map((view) => ({
    ...view,
    zoomScale: 115,
    zoomScaleNormal: 115
  }));

  const blankRow = worksheet.getRow(CUT_BLANK_ROW);
  blankRow.height = GENERATED_ROW_HEIGHT;
  for (let column = 1; column <= CUT_COLUMN_COUNT; column += 1) {
    const cell = blankRow.getCell(column);
    cell.value = "";
    cell.border = {};
    clearCellFill(cell);
  }

  const titleRow = worksheet.getRow(CUT_HARNESS_TITLE_ROW);
  titleRow.height = GENERATED_ROW_HEIGHT;
  for (let column = 1; column <= CUT_COLUMN_COUNT; column += 1) {
    const cell = titleRow.getCell(column);
    cell.value = "";
    cell.border = {};
    clearCellFill(cell);
  }
  // The harness name sits in F2 and overflows into the empty cells to its right.
  styleCutTitleCell(titleRow.getCell(CUT_HARNESS_TITLE_COLUMN));

  const groupRow = worksheet.getRow(CUT_GROUP_HEADER_ROW);
  groupRow.height = GENERATED_ROW_HEIGHT;
  for (let column = 1; column <= CUT_COLUMN_COUNT; column += 1) {
    groupRow.getCell(column).value = "";
    styleCutGroupHeaderCell(groupRow.getCell(column));
  }
  for (let column = 1; column < CUT_COLUMNS.beginApp; column += 1) {
    groupRow.getCell(column).border = {};
  }
  groupRow.getCell(CUT_COLUMNS.beginApp).value = "EXTREMITE 1";
  groupRow.getCell(CUT_COLUMNS.endApp).value = "EXTREMITE 2";
  groupRow.getCell(CUT_COLUMNS.twist).value = "SUIVI";
  mergeIfPossible(worksheet, CUT_GROUP_HEADER_ROW, CUT_COLUMNS.beginApp, CUT_GROUP_HEADER_ROW, CUT_COLUMNS.beginSealRef);
  mergeIfPossible(worksheet, CUT_GROUP_HEADER_ROW, CUT_COLUMNS.endApp, CUT_GROUP_HEADER_ROW, CUT_COLUMNS.endSealRef);
  mergeIfPossible(worksheet, CUT_GROUP_HEADER_ROW, CUT_COLUMNS.twist, CUT_GROUP_HEADER_ROW, CUT_COLUMNS.commentEnd);

  const headerRow = worksheet.getRow(CUT_HEADER_ROW);
  headerRow.height = GENERATED_ROW_HEIGHT;
  for (let column = 1; column <= CUT_COLUMN_COUNT; column += 1) {
    const cell = headerRow.getCell(column);
    cell.value = CUT_HEADERS.get(column) ?? "";
    styleCutHeaderCell(cell);
  }
  mergeIfPossible(worksheet, CUT_HEADER_ROW, CUT_COLUMNS.comment, CUT_HEADER_ROW, CUT_COLUMNS.commentEnd);
}

function clearAndFillCutSheetWorksheet(worksheet, resolutions, harnessName) {
  const sortedResolutions = [...resolutions].sort(compareResolutionsByTechnicalId);
  const templateStyleRow = worksheet.getRow(CUT_DATA_START_ROW);
  const accessoryStyles = {
    beginFill: cloneCellFill(templateStyleRow.getCell(CUT_COLUMNS.beginApp)),
    endFill: cloneCellFill(templateStyleRow.getCell(CUT_COLUMNS.endApp))
  };
  const rowsToWrite = sortedResolutions.length;
  const existingDataRows = Math.max(0, worksheet.rowCount - CUT_DATA_START_ROW + 1);

  worksheet.getRow(CUT_HARNESS_TITLE_ROW).getCell(CUT_HARNESS_TITLE_COLUMN).value = harnessName;

  for (const range of [...(worksheet.model.merges ?? [])]) {
    const parsed = parseCellRange(range);
    if (parsed !== null && parsed.startRow >= CUT_DATA_START_ROW) {
      worksheet.unMergeCells(range);
    }
  }

  for (let rowNumber = CUT_DATA_START_ROW; rowNumber <= Math.max(worksheet.rowCount, rowsToWrite + CUT_DATA_START_ROW - 1); rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    if (rowNumber > CUT_DATA_START_ROW) {
      copyRowStyle(templateStyleRow, row);
    }
    row.height = GENERATED_ROW_HEIGHT;
    for (let column = 1; column <= CUT_COLUMN_COUNT; column += 1) {
      row.getCell(column).value = null;
    }
    clearCellFill(row.getCell(CUT_COLUMNS.twist));
  }

  sortedResolutions.forEach((resolution, index) => {
    const row = worksheet.getRow(index + CUT_DATA_START_ROW);
    if (index > 0 || existingDataRows === 0) {
      copyRowStyle(templateStyleRow, row);
    }
    // Same value as the FIL column, reused by the epissure worksheet so both sheets
    // reference the wire by an identical number.
    resolution.displayWireNumber = parseTechnicalIdWireNumber(resolution.wire["Technical ID"]) ?? (index + 1);
    resolution.epiValues = [];
  });
  assignSpliceOutputTokens(sortedResolutions);

  sortedResolutions.forEach((resolution, index) => {
    const row = worksheet.getRow(index + CUT_DATA_START_ROW);
    if (index > 0 || existingDataRows === 0) {
      copyRowStyle(templateStyleRow, row);
    }
    fillFdcRow(row, index + 1, resolution, accessoryStyles);
    mergeIfPossible(worksheet, row.number, CUT_COLUMNS.comment, row.number, CUT_COLUMNS.commentEnd);
    row.commit();
  });
  const lastDataRow = rowsToWrite + CUT_DATA_START_ROW - 1;
  if (worksheet.rowCount > lastDataRow) {
    worksheet.spliceRows(lastDataRow + 1, worksheet.rowCount - lastDataRow);
  }
  applyCutSheetEndpointSeparator(worksheet);
  applyCutSheetDataFont(worksheet);
  applyCutColumnFontSizes(worksheet);

  worksheet.autoFilter = {
    from: { row: CUT_HEADER_ROW, column: 1 },
    to: { row: CUT_HEADER_ROW, column: CUT_COLUMN_COUNT }
  };
  applyGeneratedRowHeight(worksheet, lastDataRow);
  trimWorksheetModel(worksheet, lastDataRow, CUT_COLUMN_COUNT);
}

function getWireLabel(wire) {
  const technicalId = normalizeText(wire["Technical ID"]);
  return technicalId.length > 0 ? technicalId : normalizeText(wire.Name);
}

function parseTechnicalIdWireNumber(technicalId) {
  const match = normalizeText(technicalId).match(/(?:^|-)W-(\d+)(?:\D*$|$)/i);
  return match === null ? null : Number(match[1]);
}

function compareResolutionsByTechnicalId(first, second) {
  const firstNumber = parseTechnicalIdWireNumber(first.wire?.["Technical ID"]);
  const secondNumber = parseTechnicalIdWireNumber(second.wire?.["Technical ID"]);
  if (firstNumber !== null && secondNumber !== null && firstNumber !== secondNumber) {
    return firstNumber - secondNumber;
  }
  if (firstNumber !== null && secondNumber === null) {
    return -1;
  }
  if (firstNumber === null && secondNumber !== null) {
    return 1;
  }
  return (first.sourceRow ?? 0) - (second.sourceRow ?? 0);
}

function spliceSideFromPin(pinValue) {
  const pin = normalizeText(pinValue).toUpperCase();
  if (pin === "L") {
    return "left";
  }
  if (pin === "R") {
    return "right";
  }
  return null;
}

function spliceWireEntry(resolution) {
  const wire = resolution.wire;
  const number = resolution.displayWireNumber
    ?? parseTechnicalIdWireNumber(wire["Technical ID"])
    ?? getWireLabel(wire);
  const twistGroup = normalizeTwistGroupLabel(wire["Twist group"]);
  return {
    number,
    twisted: twistGroup.length > 0,
    twistGroup,
    sectionMm2: resolution.sectionMm2,
    resolution
  };
}

function addSpliceWire(splices, spliceId, side, entry) {
  const normalizedSpliceId = normalizeText(spliceId);
  if (normalizedSpliceId.length === 0 || `${entry.number}`.length === 0) {
    return;
  }
  const splice = splices.get(normalizedSpliceId) ?? {
    id: normalizedSpliceId,
    left: [],
    right: [],
    totalSectionMm2: 0
  };
  const tokenSuffix = side === "right" ? "Y" : "$";
  const sideEntry = { ...entry, side, tokenSuffix };
  splice[side].push(sideEntry);
  if (Number.isFinite(sideEntry.sectionMm2)) {
    splice.totalSectionMm2 += sideEntry.sectionMm2;
  }
  splices.set(normalizedSpliceId, splice);
}

function spliceDisplayTitle(splice) {
  const title = splice.name === undefined ? splice.id : `${splice.id} - ${splice.name}`;
  const twisted = [...splice.left, ...splice.right].some((entry) => entry.twisted);
  return twisted ? `${title} (torsadé)` : title;
}

function collectSpliceTables(resolutions, spliceNamesById = {}) {
  const splices = new Map();
  const sideFlags = [];
  for (const resolution of resolutions) {
    const wire = resolution.wire;
    const entry = spliceWireEntry(resolution);
    // The side of a splice is carried by the splice-endpoint pin (`L`/`R`), not by
    // whether the splice sits in `Begin ID` or `End ID`. Begin/End only encodes the
    // modeler's drawing direction and does not reliably match the physical side.
    const endpoints = [
      { id: wire["Begin ID"], pin: wire["Begin pin"], position: "Begin", fallbackSide: "right" },
      { id: wire["End ID"], pin: wire["End pin"], position: "End", fallbackSide: "left" }
    ];
    for (const endpoint of endpoints) {
      if (!isSpliceEndpoint(endpoint.id)) {
        continue;
      }
      const side = spliceSideFromPin(endpoint.pin);
      if (side === null) {
        // Pin is not the expected L/R marker (empty, numeric, or a 3+ branch splice):
        // do not guess. Flag it and apply the documented deterministic fallback
        // (Begin -> right, End -> left, the legacy heuristic).
        sideFlags.push({
          spliceId: normalizeText(endpoint.id),
          position: endpoint.position,
          pin: normalizeText(endpoint.pin),
          wireNumber: entry.number,
          technicalId: normalizeText(wire["Technical ID"]),
          fallbackSide: endpoint.fallbackSide
        });
        addSpliceWire(splices, endpoint.id, endpoint.fallbackSide, entry);
        continue;
      }
      addSpliceWire(splices, endpoint.id, side, entry);
    }
  }
  const tables = [...splices.values()]
    .map((splice) => ({
      ...splice,
      name: spliceNamesById[splice.id]
    }))
    .sort((first, second) => first.id.localeCompare(second.id));
  return { tables, sideFlags };
}

function spliceSleeveReference(totalSectionMm2) {
  return totalSectionMm2 >= 4 ? "911594" : "911586";
}

function finalizeSpliceOutputTokens(tables, { updateResolutions = false } = {}) {
  for (const splice of tables) {
    for (const [, entries] of [["left", splice.left], ["right", splice.right]]) {
      entries.forEach((entry, index) => {
        const position = index + 1;
        const token = `${position}${entry.tokenSuffix}`;
        entry.epiToken = token;
        entry.pageToken = `${entry.number}*${token}`;
        if (updateResolutions && entry.resolution !== undefined) {
          const epiValues = entry.resolution.epiValues ?? [];
          epiValues.push(token);
          entry.resolution.epiValues = epiValues;
        }
      });
    }
    splice.sleeveReference = spliceSleeveReference(splice.totalSectionMm2);
  }
  return tables;
}

function assignSpliceOutputTokens(resolutions) {
  const { tables } = collectSpliceTables(resolutions);
  return finalizeSpliceOutputTokens(tables, { updateResolutions: true });
}

const EPISSURE_TABLE_BORDER = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" }
};

const EPISSURE_CENTER_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF000000" }
};

const EPISSURE_TITLE_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFD9D9D9" }
};

const EPISSURE_OUTER_BORDER = {
  style: "thick",
  color: { argb: "FF000000" }
};

const EPISSURE_TABLE_START_COLUMN = 2;
const EPISSURE_TABLE_END_COLUMN = 8;
const EPISSURE_LEFT_NUMBER_COLUMN = 2;
const EPISSURE_LEFT_WIRE_COLUMN = 3;
const EPISSURE_LEFT_SPACER_COLUMN = 4;
const EPISSURE_CENTER_COLUMN = 5;
const EPISSURE_RIGHT_SPACER_COLUMN = 6;
// Right side mirrors the left: the wire label sits in the inner column (G, adjacent
// to the central spacer) and the sequence number in the outer column (H).
const EPISSURE_RIGHT_WIRE_COLUMN = 7;
const EPISSURE_RIGHT_NUMBER_COLUMN = 8;
const EPISSURE_LEFT_WIRE_WIDTH_EMU = 1260000;
const EPISSURE_CENTER_WIDTH_EMU = 700000;
const EPISSURE_ROW_MIDDLE_OFFSET_EMU = 95000;

function styleEpissureTableRow(row) {
  for (let column = EPISSURE_TABLE_START_COLUMN; column <= EPISSURE_TABLE_END_COLUMN; column += 1) {
    const cell = row.getCell(column);
    cell.border = cloneJson(EPISSURE_TABLE_BORDER);
    cell.alignment = { vertical: "middle" };
    cell.font = makeCalibriFont(cell.font ?? {});
  }
}

function setOuterBorder(cell, side) {
  cell.border = {
    ...(cell.border ?? {}),
    [side]: cloneJson(EPISSURE_OUTER_BORDER)
  };
}

function applyEpissureOuterBorder(worksheet, startRowNumber, endRowNumber) {
  for (let rowNumber = startRowNumber; rowNumber <= endRowNumber; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    for (let column = EPISSURE_TABLE_START_COLUMN; column <= EPISSURE_TABLE_END_COLUMN; column += 1) {
      const cell = row.getCell(column);
      if (rowNumber === startRowNumber) {
        setOuterBorder(cell, "top");
      }
      if (rowNumber === endRowNumber) {
        setOuterBorder(cell, "bottom");
      }
      if (column === EPISSURE_TABLE_START_COLUMN) {
        setOuterBorder(cell, "left");
      }
      if (column === EPISSURE_TABLE_END_COLUMN) {
        setOuterBorder(cell, "right");
      }
    }
  }
}

function fillEpissureCenterCell(row) {
  const centerCell = row.getCell(EPISSURE_CENTER_COLUMN);
  centerCell.value = null;
  centerCell.fill = cloneJson(EPISSURE_CENTER_FILL);
}

function writeEpissureWireCell(cell, entry, position) {
  if (entry === undefined) {
    cell.value = "";
    return;
  }
  cell.value = entry.pageToken ?? `${entry.number}*${position}${entry.tokenSuffix}`;
  if (entry.twisted) {
    cell.font = { ...makeCalibriFont(cell.font ?? {}), italic: true, bold: true };
  }
}

function collectTwistedPairPhrases(resolutions) {
  const byGroup = new Map();
  for (const resolution of resolutions) {
    const twistGroup = normalizeTwistGroupLabel(resolution.wire["Twist group"]);
    if (twistGroup.length === 0) {
      continue;
    }
    const wires = byGroup.get(twistGroup) ?? [];
    wires.push(resolution.displayWireNumber ?? parseTechnicalIdWireNumber(resolution.wire["Technical ID"]) ?? getWireLabel(resolution.wire));
    byGroup.set(twistGroup, wires);
  }
  return [...byGroup.values()]
    .filter((wires) => wires.length >= 2)
    .map((wires) => `Fils ${wires.join(" et ")} torsadés ensemble`);
}

function writeEpissureWorksheet(workbook, cutSheetName, resolutions, harnessName, spliceNamesById = {}) {
  const worksheet = workbook.addWorksheet(makeUniqueWorksheetName(workbook, `${cutSheetName} Epissures`));
  worksheet.columns = [
    { width: 2 },
    { width: 4 },
    { width: 18 },
    { width: 20 },
    { width: 10 },
    { width: 20 },
    { width: 18 },
    { width: 4 }
  ];

  const { tables, sideFlags } = collectSpliceTables(resolutions, spliceNamesById);
  const spliceTables = finalizeSpliceOutputTokens(tables);
  const connectorCurves = [];
  const suffixDiagnostics = [];
  worksheet.mergeCells(1, EPISSURE_TABLE_START_COLUMN, 1, EPISSURE_TABLE_END_COLUMN);
  const harnessCell = worksheet.getRow(1).getCell(EPISSURE_TABLE_START_COLUMN);
  harnessCell.value = harnessName;
  harnessCell.font = { ...makeCalibriFont(harnessCell.font ?? {}), bold: true };
  harnessCell.alignment = { horizontal: "center", vertical: "middle" };

  let rowNumber = 3;
  for (const splice of spliceTables) {
    const tableStartRowNumber = rowNumber;
    const titleRow = worksheet.getRow(rowNumber);
    worksheet.mergeCells(rowNumber, EPISSURE_TABLE_START_COLUMN, rowNumber, EPISSURE_TABLE_END_COLUMN);
    const titleCell = titleRow.getCell(EPISSURE_TABLE_START_COLUMN);
    titleCell.value = spliceDisplayTitle(splice);
    styleEpissureTableRow(titleRow);
    titleCell.font = { ...makeCalibriFont(titleCell.font ?? {}), bold: true };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    titleCell.fill = cloneJson(EPISSURE_TITLE_FILL);

    const rowCount = Math.max(splice.left.length, splice.right.length, 1);
    const centerRowNumber = rowNumber + Math.ceil(rowCount / 2);
    for (let index = 0; index < rowCount; index += 1) {
      const row = worksheet.getRow(rowNumber + index + 1);
      const leftWire = splice.left[index];
      const rightWire = splice.right[index];
      row.getCell(EPISSURE_LEFT_NUMBER_COLUMN).value = leftWire === undefined ? "" : index + 1;
      row.getCell(EPISSURE_RIGHT_NUMBER_COLUMN).value = rightWire === undefined ? "" : index + 1;
      styleEpissureTableRow(row);
      writeEpissureWireCell(row.getCell(EPISSURE_LEFT_WIRE_COLUMN), leftWire, index + 1);
      writeEpissureWireCell(row.getCell(EPISSURE_RIGHT_WIRE_COLUMN), rightWire, index + 1);
      row.getCell(EPISSURE_LEFT_NUMBER_COLUMN).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(EPISSURE_RIGHT_NUMBER_COLUMN).alignment = { horizontal: "center", vertical: "middle" };
      if (leftWire !== undefined) {
        suffixDiagnostics.push({
          spliceId: splice.id,
          side: "left",
          wireNumber: leftWire.number,
          position: index + 1,
          suffix: leftWire.tokenSuffix,
          reason: "left-table-column-dollar"
        });
        connectorCurves.push({
          rowNumber: row.number,
          side: "left",
          centerRowNumber
        });
      }
      if (rightWire !== undefined) {
        suffixDiagnostics.push({
          spliceId: splice.id,
          side: "right",
          wireNumber: rightWire.number,
          position: index + 1,
          suffix: rightWire.tokenSuffix,
          reason: "right-table-column-y"
        });
        connectorCurves.push({
          rowNumber: row.number,
          side: "right",
          centerRowNumber
        });
      }
      if (row.number === centerRowNumber) {
        fillEpissureCenterCell(row);
      }
    }

    const sleeveRow = worksheet.getRow(rowNumber + rowCount + 1);
    styleEpissureTableRow(sleeveRow);
    worksheet.mergeCells(sleeveRow.number, EPISSURE_LEFT_SPACER_COLUMN, sleeveRow.number, EPISSURE_RIGHT_SPACER_COLUMN);
    const sleeveCell = sleeveRow.getCell(EPISSURE_LEFT_SPACER_COLUMN);
    sleeveCell.value = splice.sleeveReference;
    sleeveCell.font = { ...makeCalibriFont(sleeveCell.font ?? {}), bold: true };
    sleeveCell.alignment = { horizontal: "center", vertical: "middle" };

    applyEpissureOuterBorder(worksheet, tableStartRowNumber, sleeveRow.number);
    rowNumber += rowCount + 4;
  }

  const twistedPhrases = collectTwistedPairPhrases(resolutions);
  if (twistedPhrases.length > 0) {
    rowNumber += 1;
    for (const phrase of twistedPhrases) {
      const row = worksheet.getRow(rowNumber);
      worksheet.mergeCells(rowNumber, EPISSURE_TABLE_START_COLUMN, rowNumber, EPISSURE_TABLE_END_COLUMN);
      const cell = row.getCell(EPISSURE_TABLE_START_COLUMN);
      cell.value = phrase;
      cell.font = { ...makeCalibriFont(cell.font ?? {}), bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      rowNumber += 1;
    }
  }
  applyGeneratedRowHeight(worksheet, worksheet.rowCount);
  return { worksheet, connectorCurves, sideFlags, suffixDiagnostics };
}

function escapeXmlAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function decodeXmlAttribute(value) {
  return String(value)
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function normalizeZipPath(pathName) {
  return pathName.replace(/^\/+/, "").replace(/\/{2,}/g, "/");
}

async function readZipText(zip, filePath) {
  const file = zip.file(filePath);
  if (file === null) {
    return null;
  }
  return file.async("text");
}

function nextRelationshipId(relsXml) {
  const ids = [...relsXml.matchAll(/\bId="rId(\d+)"/g)].map((match) => Number(match[1]));
  return `rId${Math.max(0, ...ids) + 1}`;
}

function worksheetRelPath(worksheetPath) {
  const fileName = path.posix.basename(worksheetPath);
  return `${path.posix.dirname(worksheetPath)}/_rels/${fileName}.rels`;
}

function worksheetDrawingRelationshipTarget(worksheetPath, drawingPath) {
  return path.posix.relative(path.posix.dirname(worksheetPath), drawingPath);
}

function addRelationship(relsXml, id, type, target) {
  const relationship = `<Relationship Id="${escapeXmlAttribute(id)}" Type="${escapeXmlAttribute(type)}" Target="${escapeXmlAttribute(target)}"/>`;
  return relsXml.replace("</Relationships>", `${relationship}</Relationships>`);
}

function ensureWorksheetDrawingReference(worksheetXml, relationshipId) {
  const withNamespace = worksheetXml.includes("xmlns:r=")
    ? worksheetXml
    : worksheetXml.replace("<worksheet ", "<worksheet xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" ");
  if (/<drawing\b/.test(withNamespace)) {
    return withNamespace.replace(/<drawing\b[^>]*\/>/, `<drawing r:id="${escapeXmlAttribute(relationshipId)}"/>`);
  }
  return withNamespace.replace("</worksheet>", `<drawing r:id="${escapeXmlAttribute(relationshipId)}"/></worksheet>`);
}

function ensureDrawingContentType(contentTypesXml, drawingPath) {
  const partName = `/${drawingPath}`;
  if (contentTypesXml.includes(`PartName="${partName}"`)) {
    return contentTypesXml;
  }
  const override = `<Override PartName="${escapeXmlAttribute(partName)}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`;
  return contentTypesXml.replace("</Types>", `${override}</Types>`);
}

function nextDrawingPath(zip) {
  const drawingNumbers = Object.keys(zip.files)
    .map((filePath) => filePath.match(/^xl\/drawings\/drawing(\d+)\.xml$/)?.[1])
    .filter((value) => value !== undefined)
    .map(Number);
  return `xl/drawings/drawing${Math.max(0, ...drawingNumbers) + 1}.xml`;
}

function makeConnectorAnchor(curve, index) {
  const rowIndex = curve.rowNumber - 1;
  const centerRowIndex = curve.centerRowNumber - 1;
  const isLeft = curve.side === "left";
  const topRowIndex = Math.min(rowIndex, centerRowIndex);
  const bottomRowIndex = Math.max(rowIndex, centerRowIndex);
  const from = {
    columnIndex: isLeft ? EPISSURE_LEFT_WIRE_COLUMN - 1 : EPISSURE_CENTER_COLUMN - 1,
    columnOffset: isLeft ? EPISSURE_LEFT_WIRE_WIDTH_EMU : EPISSURE_CENTER_WIDTH_EMU,
    rowIndex: topRowIndex,
    rowOffset: EPISSURE_ROW_MIDDLE_OFFSET_EMU
  };
  const to = {
    columnIndex: isLeft ? EPISSURE_CENTER_COLUMN - 1 : EPISSURE_RIGHT_WIRE_COLUMN - 1,
    columnOffset: 0,
    rowIndex: bottomRowIndex,
    rowOffset: EPISSURE_ROW_MIDDLE_OFFSET_EMU
  };
  const shouldFlipVertically = rowIndex > centerRowIndex;
  const shouldFlipHorizontally = !isLeft;
  const name = `${isLeft ? "Left" : "Right"} splice line ${index}`;

  return `  <xdr:twoCellAnchor editAs="oneCell">
    <xdr:from>
      <xdr:col>${from.columnIndex}</xdr:col>
      <xdr:colOff>${from.columnOffset}</xdr:colOff>
      <xdr:row>${from.rowIndex}</xdr:row>
      <xdr:rowOff>${from.rowOffset}</xdr:rowOff>
    </xdr:from>
    <xdr:to>
      <xdr:col>${to.columnIndex}</xdr:col>
      <xdr:colOff>${to.columnOffset}</xdr:colOff>
      <xdr:row>${to.rowIndex}</xdr:row>
      <xdr:rowOff>${to.rowOffset}</xdr:rowOff>
    </xdr:to>
    <xdr:cxnSp macro="">
      <xdr:nvCxnSpPr>
        <xdr:cNvPr id="${index}" name="${escapeXmlAttribute(name)}"/>
        <xdr:cNvCxnSpPr/>
        <xdr:nvPr/>
      </xdr:nvCxnSpPr>
      <xdr:spPr>
        <a:xfrm${shouldFlipHorizontally ? " flipH=\"1\"" : ""}${shouldFlipVertically ? " flipV=\"1\"" : ""}>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
        </a:xfrm>
        <a:prstGeom prst="straightConnector1">
          <a:avLst/>
        </a:prstGeom>
        <a:ln w="19050" cap="rnd">
          <a:solidFill>
            <a:srgbClr val="000000"/>
          </a:solidFill>
          <a:round/>
        </a:ln>
      </xdr:spPr>
    </xdr:cxnSp>
    <xdr:clientData/>
  </xdr:twoCellAnchor>`;
}

function buildDrawingXml(curves) {
  const anchors = curves.map((curve, index) => makeConnectorAnchor(curve, index + 1)).join("\n");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
${anchors}
</xdr:wsDr>`;
}

async function mapWorksheetNamesToPaths(zip) {
  const workbookXml = await readZipText(zip, "xl/workbook.xml");
  const workbookRelsXml = await readZipText(zip, "xl/_rels/workbook.xml.rels");
  if (workbookXml === null || workbookRelsXml === null) {
    throw new Error("Unable to patch epissure curve drawings: workbook XML relationships are missing.");
  }

  const relationshipTargets = new Map();
  for (const match of workbookRelsXml.matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*\/>/g)) {
    relationshipTargets.set(match[1], normalizeZipPath(path.posix.join("xl", decodeXmlAttribute(match[2]))));
  }

  const sheetPaths = new Map();
  for (const match of workbookXml.matchAll(/<sheet\b[^>]*\bname="([^"]+)"[^>]*\br:id="([^"]+)"[^>]*\/>/g)) {
    const sheetName = decodeXmlAttribute(match[1]);
    const targetPath = relationshipTargets.get(match[2]);
    if (targetPath !== undefined) {
      sheetPaths.set(sheetName, targetPath);
    }
  }
  return sheetPaths;
}

async function patchEpissureCurveDrawings(outputPath, drawingPlans) {
  const plansWithCurves = drawingPlans.filter((plan) => plan.connectorCurves.length > 0);
  if (plansWithCurves.length === 0) {
    return;
  }

  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(readFileSync(outputPath));
  const sheetPaths = await mapWorksheetNamesToPaths(zip);
  let contentTypesXml = await readZipText(zip, "[Content_Types].xml");
  if (contentTypesXml === null) {
    throw new Error("Unable to patch epissure curve drawings: [Content_Types].xml is missing.");
  }

  for (const plan of plansWithCurves) {
    const worksheetPath = sheetPaths.get(plan.worksheetName);
    if (worksheetPath === undefined) {
      throw new Error(`Unable to patch epissure curve drawings: worksheet '${plan.worksheetName}' was not found in workbook.xml.`);
    }

    const drawingPath = nextDrawingPath(zip);
    const relPath = worksheetRelPath(worksheetPath);
    const worksheetXml = await readZipText(zip, worksheetPath);
    const existingRelsXml = await readZipText(zip, relPath);
    if (worksheetXml === null) {
      throw new Error(`Unable to patch epissure curve drawings: worksheet part '${worksheetPath}' is missing.`);
    }

    const relsXml = existingRelsXml ?? "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"></Relationships>";
    const relationshipId = nextRelationshipId(relsXml);
    const updatedRelsXml = addRelationship(
      relsXml,
      relationshipId,
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing",
      worksheetDrawingRelationshipTarget(worksheetPath, drawingPath)
    );

    zip.file(drawingPath, buildDrawingXml(plan.connectorCurves));
    zip.file(relPath, updatedRelsXml);
    zip.file(worksheetPath, ensureWorksheetDrawingReference(worksheetXml, relationshipId));
    contentTypesXml = ensureDrawingContentType(contentTypesXml, drawingPath);
  }

  zip.file("[Content_Types].xml", contentTypesXml);
  writeFileSync(outputPath, await zip.generateAsync({ type: "nodebuffer" }));
}

async function writeCutSheetWorkbook(ExcelJS, templatePath, outputPath, sheetResolutions) {
  const workbook = await readWorkbook(ExcelJS, templatePath);
  const spliceWorksheet = workbook.getWorksheet("Epissures");
  if (spliceWorksheet !== undefined) {
    workbook.removeWorksheet(spliceWorksheet.id);
  }
  const templateWorksheet = workbook.getWorksheet("Feuille de coupe") ?? workbook.worksheets[0];
  for (const candidateWorksheet of workbook.worksheets) {
    removeWorksheetNotes(candidateWorksheet);
  }
  prepareCutSheetWorksheet(templateWorksheet);

  const outputWorksheets = sheetResolutions.map((sheet, index) => {
    const worksheet = index === 0
      ? templateWorksheet
      : copyWorksheetTemplate(workbook, templateWorksheet, makeUniqueWorksheetName(workbook, sheet.name));
    if (sheetResolutions.length > 1) {
      const uniqueName = index === 0
        ? makeUniqueWorksheetName(workbook, sheet.name)
        : worksheet.name;
      worksheet.name = uniqueName;
    }
    return { worksheet, resolutions: sheet.resolutions, harnessName: sheet.harnessName, spliceNamesById: sheet.spliceNamesById ?? {} };
  });

  const epissureDrawingPlans = [];
  const spliceSideFlags = [];
  const epissureTokenDiagnostics = [];
  outputWorksheets.forEach(({ worksheet, resolutions, harnessName, spliceNamesById }) => {
    clearAndFillCutSheetWorksheet(worksheet, resolutions, harnessName);
    const epissures = writeEpissureWorksheet(workbook, worksheet.name, resolutions, harnessName, spliceNamesById);
    epissureDrawingPlans.push({
      worksheetName: epissures.worksheet.name,
      connectorCurves: epissures.connectorCurves
    });
    for (const flag of epissures.sideFlags) {
      spliceSideFlags.push({ ...flag, cutSheet: worksheet.name });
    }
    for (const diagnostic of epissures.suffixDiagnostics) {
      epissureTokenDiagnostics.push({ ...diagnostic, cutSheet: worksheet.name });
    }
  });
  ensureDirectory(path.dirname(outputPath));
  await workbook.xlsx.writeFile(outputPath);
  await patchEpissureCurveDrawings(outputPath, epissureDrawingPlans);
  return { spliceSideFlags, epissureTokenDiagnostics };
}

async function buildCatalogArtifact(ExcelJS) {
  const catalog = await readAmipiCatalog(ExcelJS, DEFAULTS.amipiWorkbook);
  const fdcPreferences = await readFdcPreferences(ExcelJS, DEFAULTS.templateWorkbook);
  const explicitPreferences = {};
  for (const [key, reference] of MANUAL_CABLE_PREFERENCES) {
    explicitPreferences[key] = reference;
  }
  const priorityCablePreferences = buildPriorityCablePreferences(catalog);
  const catalogReferences = new Set(catalog.cables.map((cable) => cable.reference));
  const allPreferredReferences = {
    ...fdcPreferences.preferences,
    ...fdcPreferences.frequencyPreferences,
    ...priorityCablePreferences.preferences,
    ...explicitPreferences
  };
  const preferredReferenceIssues = Object.entries(allPreferredReferences)
    .filter(([, reference]) => !catalogReferences.has(reference))
    .map(([key, reference]) => ({ key, reference, reason: "reference-not-found-in-amipi-catalog" }));

  const artifact = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sources: {
      amipiWorkbook: DEFAULTS.amipiWorkbook,
      fdcReferenceWorkbook: DEFAULTS.templateWorkbook
    },
    colorAliases: Object.fromEntries(APP_TO_AMIPI_COLOR),
    fdcColorDisplayAliases: Object.fromEntries(AMIPI_TO_FDC_COLOR),
    stats: {
      cableCount: catalog.cables.length,
      ignoredAmipiRows: catalog.ignoredRows.length,
      totalKeys: catalog.keyStats.totalKeys,
      ambiguousKeys: catalog.keyStats.ambiguousKeys,
      fdcPreferenceKeys: Object.keys(fdcPreferences.preferences).length,
      expectedFrequencyPreferenceKeys: Object.keys(fdcPreferences.frequencyPreferences).length,
      explicitPreferenceKeys: Object.keys(explicitPreferences).length,
      fdcPreferenceConflicts: fdcPreferences.conflicts.length,
      priorityCableKeys: Object.keys(priorityCablePreferences.preferences).length,
      preferredReferenceIssues: preferredReferenceIssues.length
    },
    cables: catalog.cables,
    preferences: fdcPreferences.preferences,
    expectedFrequencyPreferences: fdcPreferences.frequencyPreferences,
    explicitPreferences,
    priorityCablePreferences: priorityCablePreferences.preferences,
    fdcPreferenceRows: fdcPreferences.rows,
    expectedFrequencyPreferenceRows: fdcPreferences.frequencyRows,
    priorityCablePreferenceRows: priorityCablePreferences.rows,
    ambiguities: catalog.ambiguities,
    issues: {
      ignoredAmipiRows: catalog.ignoredRows,
      fdcPreferenceConflicts: fdcPreferences.conflicts,
      preferredReferenceIssues
    }
  };

  ensureDirectory(DEFAULTS.dataDirectory);
  const outputPath = path.join(DEFAULTS.dataDirectory, "amipi-cables.normalized.json");
  await import("node:fs").then((fs) => fs.writeFileSync(outputPath, stringifyJson(artifact), "utf8"));
  return { artifact, outputPath };
}

async function buildCutSheets(ExcelJS, catalogArtifact) {
  const resolver = buildResolver(
    {
      cables: catalogArtifact.cables
    },
    {
      preferences: catalogArtifact.preferences,
      expectedFrequencyPreferences: catalogArtifact.expectedFrequencyPreferences ?? {},
      explicitPreferences: catalogArtifact.explicitPreferences ?? {},
      priorityPreferences: catalogArtifact.priorityCablePreferences ?? {}
    }
  );
  const files = listWireExportFiles(DEFAULTS.exportDirectory);
  const reports = [];

  ensureDirectory(DEFAULTS.outputDirectory);

  for (const filePath of files) {
    const exportData = await readWireExport(ExcelJS, filePath);
    const sheetResolutions = exportData.sheets.map((sheet) => ({
      name: sheet.name,
      harnessName: deriveHarnessName(sheet.name, filePath),
      spliceNamesById: sheet.spliceNamesById ?? {},
      resolutions: resolveWireRows(filePath, sheet.name, sheet.rows, resolver)
    }));
    const resolutions = sheetResolutions.flatMap((sheet) => sheet.resolutions);
    const baseName = path.basename(filePath, path.extname(filePath));
    const outputPath = path.join(DEFAULTS.outputDirectory, `Fdc_generated_${baseName}.xlsx`);
    const { spliceSideFlags, epissureTokenDiagnostics } = await writeCutSheetWorkbook(ExcelJS, DEFAULTS.templateWorkbook, outputPath, sheetResolutions);
    if (spliceSideFlags.length > 0) {
      console.warn(`${path.basename(filePath)}: ${spliceSideFlags.length} splice endpoint(s) without an L/R pin, placed by fallback side. See report 'spliceSideFlags'.`);
    }
    reports.push({
      sourceFile: filePath,
      outputFile: outputPath,
      summary: summarizeResolutions(resolutions),
      spliceSideFlags,
      epissureTokenRule: {
        status: "derived-from-local-table-placement",
        dollar: "wire token is placed on the left side of the generated splice table",
        y: "wire token is placed on the right side of the generated splice table"
      },
      epissureTokenDiagnostics,
      sheets: sheetResolutions.map((sheet) => ({
        name: sheet.name,
        harnessName: sheet.harnessName,
        spliceNamesById: sheet.spliceNamesById,
        summary: summarizeResolutions(sheet.resolutions),
        unresolvedRows: sheet.resolutions
          .filter((resolution) => resolution.status !== "resolved")
          .map((resolution) => ({
            sourceSheet: resolution.sourceSheet,
            sourceRow: resolution.sourceRow,
            technicalId: resolution.wire["Technical ID"],
            name: resolution.wire.Name,
            sectionMm2: resolution.sectionMm2,
            color: resolution.color,
            reason: resolution.reason,
            candidates: resolution.candidates ?? []
          }))
      })),
      unresolvedRows: resolutions
        .filter((resolution) => resolution.status !== "resolved")
        .map((resolution) => ({
          sourceSheet: resolution.sourceSheet,
          sourceRow: resolution.sourceRow,
          technicalId: resolution.wire["Technical ID"],
          name: resolution.wire.Name,
          sectionMm2: resolution.sectionMm2,
          color: resolution.color,
          reason: resolution.reason,
          candidates: resolution.candidates ?? []
        })),
      rows: resolutions
    });
  }

  ensureDirectory(DEFAULTS.reportDirectory);
  const reportPath = path.join(DEFAULTS.reportDirectory, "wire-resolution-report.json");
  await import("node:fs").then((fs) => fs.writeFileSync(reportPath, stringifyJson({
    version: 1,
    generatedAt: new Date().toISOString(),
    files: reports
  }), "utf8"));
  return { reports, reportPath };
}

async function main() {
  const command = process.argv[2] ?? "build";
  const ExcelJS = await loadExcelJS();

  if (!existsSync(DEFAULTS.amipiWorkbook)) {
    throw new Error(`Missing AMIPI workbook: ${DEFAULTS.amipiWorkbook}`);
  }
  if (!existsSync(DEFAULTS.templateWorkbook)) {
    throw new Error(`Missing FDC template workbook: ${DEFAULTS.templateWorkbook}`);
  }

  if (command === "catalog") {
    const { artifact, outputPath } = await buildCatalogArtifact(ExcelJS);
    console.log(`Catalog written: ${outputPath}`);
    console.log(`Cables: ${artifact.stats.cableCount}, ambiguous keys: ${artifact.stats.ambiguousKeys}, FDC preferences: ${artifact.stats.fdcPreferenceKeys}`);
    return;
  }

  if (command === "cut-sheet") {
    const catalogPath = path.join(DEFAULTS.dataDirectory, "amipi-cables.normalized.json");
    if (!existsSync(catalogPath)) {
      throw new Error(`Missing catalog artifact: ${catalogPath}. Run \`npm run catalog\` first.`);
    }
    const catalogArtifact = JSON.parse(readFileSync(catalogPath, "utf8"));
    const { reports, reportPath } = await buildCutSheets(ExcelJS, catalogArtifact);
    console.log(`Resolution report written: ${reportPath}`);
    for (const report of reports) {
      console.log(`${path.basename(report.sourceFile)}: ${report.summary.resolvedRows}/${report.summary.totalRows} resolved -> ${report.outputFile}`);
    }
    return;
  }

  if (command === "build") {
    const { artifact, outputPath } = await buildCatalogArtifact(ExcelJS);
    const { reports, reportPath } = await buildCutSheets(ExcelJS, artifact);
    console.log(`Catalog written: ${outputPath}`);
    console.log(`Resolution report written: ${reportPath}`);
    console.log(`Cables: ${artifact.stats.cableCount}, ambiguous keys: ${artifact.stats.ambiguousKeys}, FDC preferences: ${artifact.stats.fdcPreferenceKeys}`);
    for (const report of reports) {
      console.log(`${path.basename(report.sourceFile)}: ${report.summary.resolvedRows}/${report.summary.totalRows} resolved -> ${report.outputFile}`);
    }
    return;
  }

  throw new Error(`Unknown command '${command}'. Use build, catalog, or cut-sheet.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
