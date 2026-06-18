#!/usr/bin/env node

import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const FALLBACK_APP_ROOT = path.resolve(ROOT, "../electrical-plan-editor");

const DEFAULTS = {
  amipiWorkbook: path.join(ROOT, "inputs", "amipi", "Liste cables AMIPI.xlsx"),
  templateWorkbook: path.join(ROOT, "inputs", "templates", "Fdc_CI1250507 Principal CIRCLE.xlsx"),
  exportDirectory: path.join(ROOT, "examples", "exports"),
  dataDirectory: path.join(ROOT, "data"),
  reportDirectory: path.join(ROOT, "reports"),
  outputDirectory: path.join(ROOT, "out")
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

const SPLICE_ACCESSORY_LABEL = "PREDEN 13MM";

const MANUAL_CABLE_PREFERENCES = new Map([
  ["0.5|GR", "Z000245902"],
  ["0.5|RS", "104604"]
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

function isSpliceEndpoint(value) {
  return /(^|[-_\s])EP(?:[-_\s]|\d|$)/i.test(normalizeText(value));
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

  return { preferences, conflicts, rows };
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
    const priorityReference = fdcPreferences.priorityPreferences?.[key];
    const preferredReference = fdcPreferences.preferences[key];

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
    const rows = [];
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const values = headers.map((header, index) => [header, normalizeText(row.getCell(index + 1).value)]);
      if (values.every(([, value]) => value.length === 0)) {
        continue;
      }
      rows.push(Object.fromEntries(values));
    }

    sheets.push({ name: worksheet.name, headers, headerIndex, rows });
  }

  return { sheets };
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
        rows: rows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, normalizeText(row[index] ?? "")])))
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
  for (let column = 8; column <= 13; column += 1) {
    applyAccessoryBandStyle(row, column, accessoryStyles.beginFill);
  }
  for (let column = 14; column <= 20; column += 1) {
    applyAccessoryBandStyle(row, column, accessoryStyles.endFill);
  }
}

function applyEmptyPairHatches(row, accessoryStyles) {
  applyPairHatchIfEmpty(row, 10, 11);
  applyPairHatchIfEmpty(row, 12, 13);
  applyPairHatchIfEmpty(row, 17, 18);
  applyPairHatchIfEmpty(row, 19, 20);
}

function fillEndpointAccessoryCells(row, startColumn, isSplice, connection, seal) {
  if (isSplice) {
    for (let column = startColumn; column <= startColumn + 3; column += 1) {
      const cell = row.getCell(column);
      cell.value = null;
      cell.font = makeSpliceFont(cell.font ?? {});
      cell.alignment = { ...(cell.alignment ?? {}), horizontal: "center", vertical: "middle" };
    }
    row.getCell(startColumn).value = SPLICE_ACCESSORY_LABEL;
    try {
      row.worksheet.mergeCells(row.number, startColumn, row.number, startColumn + 3);
    } catch (error) {
      throw new Error(`Unable to merge splice cells row ${row.number}, columns ${startColumn}-${startColumn + 3} on worksheet '${row.worksheet.name}': ${error instanceof Error ? error.message : error}`);
    }
    return;
  }

  row.getCell(startColumn).value = excelCellValue(connection.name);
  row.getCell(startColumn + 1).value = excelCellValue(connection.reference);
  row.getCell(startColumn + 2).value = excelCellValue(seal.name);
  row.getCell(startColumn + 3).value = excelCellValue(seal.reference);
}

function fillFdcRow(row, wireNumber, resolution, accessoryStyles) {
  const wire = resolution.wire;
  const beginConnection = readReferenceAndName(wire, "Begin connection ref", "Begin connection name");
  const beginSeal = readReferenceAndName(wire, "Begin seal ref", "Begin seal name");
  const endConnection = readReferenceAndName(wire, "End connection ref", "End connection name");
  const endSeal = readReferenceAndName(wire, "End seal ref", "End seal name");
  const beginIsSplice = isSpliceEndpoint(wire["Begin ID"]);
  const endIsSplice = isSpliceEndpoint(wire["End ID"]);

  row.getCell(1).value = wire.Name;
  row.getCell(2).value = wire.Name;
  row.getCell(3).value = wireNumber;
  row.getCell(4).value = resolution.sectionMm2;
  row.getCell(5).value = resolution.color.ok ? formatFdcColor(resolution.color.colorCode) : resolution.color.raw;
  row.getCell(6).value = excelCellValue(resolution.cableReference ?? "");
  row.getCell(7).value = parseNumber(wire["Length (mm)"]) ?? wire["Length (mm)"];
  row.getCell(8).value = wire["Begin ID"];
  row.getCell(9).value = excelCellValue(normalizePin(wire["Begin pin"]));
  applyAccessoryStyles(row, accessoryStyles);
  fillEndpointAccessoryCells(row, 10, beginIsSplice, beginConnection, beginSeal);
  row.getCell(14).value = wire["End ID"];
  row.getCell(15).value = wire["End ID"];
  row.getCell(16).value = excelCellValue(normalizePin(wire["End pin"]));
  fillEndpointAccessoryCells(row, 17, endIsSplice, endConnection, endSeal);
  applyEmptyPairHatches(row, accessoryStyles);
  row.getCell(21).value = wire["Twist group"] ?? "";
  row.getCell(22).value = resolution.status === "resolved" ? "" : `UNRESOLVED: ${resolution.reason}`;
  row.getCell(23).value = resolution.normalizedKey ?? "";
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

function prepareCutSheetWorksheet(worksheet) {
  worksheet.spliceColumns(19, 1);
  unmergeAccessoryRanges(worksheet);
}

function clearAndFillCutSheetWorksheet(worksheet, resolutions) {
  const templateStyleRow = worksheet.getRow(2);
  const accessoryStyles = {
    beginFill: cloneCellFill(templateStyleRow.getCell(8)),
    endFill: cloneCellFill(templateStyleRow.getCell(14))
  };
  const rowsToWrite = resolutions.length;
  const existingDataRows = Math.max(0, worksheet.rowCount - 1);

  for (let rowNumber = 2; rowNumber <= Math.max(worksheet.rowCount, rowsToWrite + 1); rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    if (rowNumber > 2) {
      copyRowStyle(templateStyleRow, row);
    }
    for (let column = 1; column <= 23; column += 1) {
      row.getCell(column).value = null;
    }
  }

  resolutions.forEach((resolution, index) => {
    const row = worksheet.getRow(index + 2);
    if (index > 0 || existingDataRows === 0) {
      copyRowStyle(templateStyleRow, row);
    }
    fillFdcRow(row, index + 1, resolution, accessoryStyles);
    row.commit();
  });

  worksheet.autoFilter = {
    from: "A1",
    to: { row: 1, column: 23 }
  };
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
    return { worksheet, resolutions: sheet.resolutions };
  });

  outputWorksheets.forEach(({ worksheet, resolutions }) => {
    clearAndFillCutSheetWorksheet(worksheet, resolutions);
  });
  ensureDirectory(path.dirname(outputPath));
  await workbook.xlsx.writeFile(outputPath);
}

async function buildCatalogArtifact(ExcelJS) {
  const catalog = await readAmipiCatalog(ExcelJS, DEFAULTS.amipiWorkbook);
  const fdcPreferences = await readFdcPreferences(ExcelJS, DEFAULTS.templateWorkbook);
  for (const [key, reference] of MANUAL_CABLE_PREFERENCES) {
    fdcPreferences.preferences[key] = reference;
  }
  const priorityCablePreferences = buildPriorityCablePreferences(catalog);
  for (const [key, reference] of Object.entries(priorityCablePreferences.preferences)) {
    fdcPreferences.preferences[key] = reference;
  }
  const catalogReferences = new Set(catalog.cables.map((cable) => cable.reference));
  const preferredReferenceIssues = Object.entries(fdcPreferences.preferences)
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
      fdcPreferenceConflicts: fdcPreferences.conflicts.length,
      priorityCableKeys: Object.keys(priorityCablePreferences.preferences).length,
      preferredReferenceIssues: preferredReferenceIssues.length
    },
    cables: catalog.cables,
    preferences: fdcPreferences.preferences,
    priorityCablePreferences: priorityCablePreferences.preferences,
    fdcPreferenceRows: fdcPreferences.rows,
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
      resolutions: resolveWireRows(filePath, sheet.name, sheet.rows, resolver)
    }));
    const resolutions = sheetResolutions.flatMap((sheet) => sheet.resolutions);
    const baseName = path.basename(filePath, path.extname(filePath));
    const outputPath = path.join(DEFAULTS.outputDirectory, `Fdc_generated_${baseName}.xlsx`);
    await writeCutSheetWorkbook(ExcelJS, DEFAULTS.templateWorkbook, outputPath, sheetResolutions);
    reports.push({
      sourceFile: filePath,
      outputFile: outputPath,
      summary: summarizeResolutions(resolutions),
      sheets: sheetResolutions.map((sheet) => ({
        name: sheet.name,
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
