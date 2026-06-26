/**
 * Pickup Gudang — Google Apps Script Web App backend.
 *
 * Drop-in replacement for the Express + Replit Connectors API. It speaks the
 * exact same "action protocol" the frontend uses, reads/writes the same Google
 * Sheet, and issues the same HMAC role tokens, so the static SPA can talk to it
 * with zero code changes (just set VITE_APPS_SCRIPT_URL to the Web App URL).
 *
 * Protocol:
 *   - reads:  GET  ?action=<a>&...&token=...
 *   - writes: POST  body = JSON string { action, token?, ... } (text/plain)
 *   - every response is HTTP 200 JSON: { ok:true, data } | { ok:false, error, code? }
 *
 * Setup (see deploy/PANDUAN-APPS-SCRIPT.md):
 *   1. Project Settings -> Script Properties:
 *        SESSION_SECRET   (required, any long random string)
 *        ADMIN_PIN        (optional, default 4321)
 *        DASHBOARD_PIN    (optional, default 1234)
 *        SPREADSHEET_ID   (optional, default the owner's sheet)
 *   2. Deploy -> New deployment -> Web app
 *        Execute as: Me
 *        Who has access: Anyone
 */

// ---- Configuration -------------------------------------------------------

var DEFAULT_SPREADSHEET_ID = "1Jb3SAOEMt1DtreH16jt9C6wdcnl_I01-aGKGgjfGlpg";
var MASTER_SHEET = "MASTER_DATA";
var HISTORY_SHEET = "RIWAYAT";
var MASTER_HEADER = [
  "kode_pickup",
  "nama_penerima",
  "alamat",
  "kurir",
  "status",
  "notes",
];
var HISTORY_HEADER = [
  "timestamp",
  "nama_driver",
  "no_hp",
  "kode_pickup",
  "nama_penerima",
  "alamat",
  "kurir",
  "status",
];
var STATUS_PENDING = "Menunggu";
var STATUS_DONE = "Sudah Diambil";
var TOKEN_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours
var TIMEZONE = "Asia/Jakarta";

function prop_(name, fallback) {
  var v = PropertiesService.getScriptProperties().getProperty(name);
  return v && String(v).length ? v : fallback;
}

function spreadsheetId_() {
  return prop_("SPREADSHEET_ID", DEFAULT_SPREADSHEET_ID);
}

// ---- HTTP entry points ---------------------------------------------------

function doGet(e) {
  return handle_((e && e.parameter) || {});
}

function doPost(e) {
  var params = {};
  try {
    if (e && e.postData && e.postData.contents) {
      params = JSON.parse(e.postData.contents);
    }
  } catch (err) {
    // Fall back to query params if the body isn't valid JSON.
    params = (e && e.parameter) || {};
  }
  return handle_(params);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function ok_(data) {
  return json_({ ok: true, data: data });
}

function fail_(error, code) {
  var out = { ok: false, error: error };
  if (code) out.code = code;
  return json_(out);
}

// ---- Action router -------------------------------------------------------

function handle_(params) {
  var action = String(params.action || "");
  try {
    switch (action) {
      case "health":
        return ok_({ status: "ok" });
      case "packages":
        return ok_(searchPackages_(String(params.q || "")));
      case "pickups":
        if (!authorize_(params.token, "security")) {
          return fail_("Akses ditolak. Masukkan PIN yang benar.", "unauthorized");
        }
        return ok_(
          listPickups_(params.todayOnly === "true" || params.todayOnly === true)
        );
      case "stats":
        if (!authorize_(params.token, "security")) {
          return fail_("Akses ditolak. Masukkan PIN yang benar.", "unauthorized");
        }
        return ok_(getStats_());
      case "verifyPin":
        return verifyPin_(params);
      case "createPickup":
        return createPickup_(params);
      case "importPackages":
        if (!authorize_(params.token, "admin")) {
          return fail_("Akses ditolak. Masukkan PIN yang benar.", "unauthorized");
        }
        return importPackages_(params.items || []);
      case "resetPackages":
        if (!authorize_(params.token, "admin")) {
          return fail_("Akses ditolak. Masukkan PIN yang benar.", "unauthorized");
        }
        return resetPackages_();
      default:
        return fail_("Aksi tidak dikenal: " + action);
    }
  } catch (err) {
    return fail_(
      "Terjadi kesalahan server: " + (err && err.message ? err.message : err),
      "server_error"
    );
  }
}

// ---- Auth (HMAC role tokens, identical format to the Express backend) -----

function base64url_(bytes) {
  // Utilities.base64EncodeWebSafe handles byte[] or string; strip padding to
  // match Node's `digest("base64url")` / `Buffer.toString("base64url")`.
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, "");
}

function sign_(payload) {
  var secret = prop_("SESSION_SECRET", "dev-insecure-pickup-secret");
  var raw = Utilities.computeHmacSha256Signature(payload, secret);
  return base64url_(raw);
}

function issueToken_(role) {
  var payload = role + "." + Date.now();
  return base64url_(payload) + "." + sign_(payload);
}

function verifyToken_(token) {
  if (!token) return null;
  token = String(token);
  var dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  var b64 = token.slice(0, dot);
  var sig = token.slice(dot + 1);
  var payload;
  try {
    var bytes = Utilities.base64DecodeWebSafe(b64);
    payload = Utilities.newBlob(bytes).getDataAsString();
  } catch (err) {
    return null;
  }
  if (sign_(payload) !== sig) return null;
  var parts = payload.split(".");
  var role = parts[0];
  var issuedAt = Number(parts[1]);
  if (!isFinite(issuedAt) || Date.now() - issuedAt > TOKEN_MAX_AGE_MS) return null;
  return role === "admin" || role === "security" ? role : null;
}

// Admin always passes; otherwise the role must equal `allowed`.
function authorize_(token, allowed) {
  var role = verifyToken_(token);
  if (!role) return null;
  if (role === "admin" || role === allowed) return role;
  return null;
}

function verifyPin_(params) {
  var pin = String(params.pin || "");
  var role = params.role === "admin" ? "admin" : "security";
  var expected =
    role === "admin" ? prop_("ADMIN_PIN", "4321") : prop_("DASHBOARD_PIN", "1234");
  var valid = pin === String(expected);
  return ok_({ valid: valid, token: valid ? issueToken_(role) : undefined });
}

// ---- Sheets helpers ------------------------------------------------------

function ss_() {
  return SpreadsheetApp.openById(spreadsheetId_());
}

function ensureSheets_() {
  var ss = ss_();
  ensureTab_(ss, MASTER_SHEET, MASTER_HEADER);
  ensureTab_(ss, HISTORY_SHEET, HISTORY_HEADER);
  return ss;
}

function ensureTab_(ss, name, header) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
  }
  return sheet;
}

function cell_(row, idx) {
  var v = row[idx];
  return (v === null || v === undefined ? "" : String(v)).trim();
}

function getRows_(sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow <= 1 || lastCol === 0) return [];
  return sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
}

// ---- Business logic (parity with pickup-data.ts) -------------------------

function listPackages_() {
  var sheet = ensureSheets_().getSheetByName(MASTER_SHEET);
  var rows = getRows_(sheet);
  return rows.map(function (row) {
    return {
      kode_pickup: cell_(row, 0),
      nama_penerima: cell_(row, 1),
      alamat: cell_(row, 2),
      kurir: cell_(row, 3),
      status: cell_(row, 4) || STATUS_PENDING,
      notes: cell_(row, 5),
    };
  });
}

function searchPackages_(query) {
  var all = listPackages_();
  var q = String(query || "").trim().toLowerCase();
  if (!q) return all;
  return all.filter(function (p) {
    return p.kode_pickup.toLowerCase().indexOf(q) !== -1;
  });
}

function listPickups_(todayOnly) {
  var sheet = ensureSheets_().getSheetByName(HISTORY_SHEET);
  var rows = getRows_(sheet).map(function (row) {
    return {
      timestamp: cell_(row, 0),
      nama_driver: cell_(row, 1),
      no_hp: cell_(row, 2),
      kode_pickup: cell_(row, 3),
      nama_penerima: cell_(row, 4),
      alamat: cell_(row, 5),
      kurir: cell_(row, 6),
      status: cell_(row, 7) || STATUS_DONE,
    };
  });
  if (todayOnly) {
    var today = jakartaDateStr_(new Date());
    rows = rows.filter(function (r) {
      var d = new Date(r.timestamp);
      if (isNaN(d.getTime())) return false;
      return jakartaDateStr_(d) === today;
    });
  }
  return rows.reverse(); // newest first
}

function importPackages_(items) {
  var ss = ensureSheets_();
  var sheet = ss.getSheetByName(MASTER_SHEET);
  var existing = listPackages_();
  var seen = {};
  existing.forEach(function (p) {
    seen[p.kode_pickup.toLowerCase()] = true;
  });

  var toAdd = [];
  for (var i = 0; i < items.length; i++) {
    var item = items[i] || {};
    var code = String(item.kode_pickup || "").trim();
    if (!code) continue;
    var key = code.toLowerCase();
    if (seen[key]) continue;
    seen[key] = true;
    toAdd.push([
      code,
      String(item.nama_penerima || "").trim(),
      String(item.alamat || "").trim(),
      String(item.kurir || "").trim(),
      STATUS_PENDING,
      "",
    ]);
  }

  if (toAdd.length > 0) {
    sheet
      .getRange(sheet.getLastRow() + 1, 1, toAdd.length, MASTER_HEADER.length)
      .setValues(toAdd);
  }

  var added = toAdd.length;
  var skipped = items.length - added;
  var message =
    added > 0
      ? added +
        " paket berhasil diimpor" +
        (skipped > 0 ? ", " + skipped + " dilewati (duplikat)" : "") +
        "."
      : "Tidak ada paket baru diimpor (" + skipped + " duplikat).";
  return ok_({ added: added, skipped: skipped, message: message });
}

function resetPackages_() {
  var sheet = ensureSheets_().getSheetByName(MASTER_SHEET);
  var lastRow = sheet.getLastRow();
  var deleted = Math.max(lastRow - 1, 0);
  if (deleted > 0) {
    sheet.getRange(2, 1, deleted, sheet.getLastColumn()).clearContent();
  }
  var message =
    deleted > 0
      ? deleted + " paket dihapus dari data master."
      : "Data master sudah kosong.";
  return ok_({ deleted: deleted, message: message });
}

function createPickup_(params) {
  var ss = ensureSheets_();
  var code = String(params.kode_pickup || "").trim();
  if (!code) return fail_("Kode pickup wajib diisi.");

  var masterSheet = ss.getSheetByName(MASTER_SHEET);
  var historySheet = ss.getSheetByName(HISTORY_SHEET);
  var masterRows = getRows_(masterSheet);
  var historyRows = getRows_(historySheet);

  // Duplicate guard: a package can only be picked up once.
  var lower = code.toLowerCase();
  for (var h = 0; h < historyRows.length; h++) {
    if (cell_(historyRows[h], 3).toLowerCase() === lower) {
      return fail_("Paket " + code + " sudah pernah diambil sebelumnya.");
    }
  }

  // Enrich from master + find the row to mark picked up.
  var masterRowIndex = -1;
  var detail = { nama_penerima: "", alamat: "", kurir: "" };
  for (var m = 0; m < masterRows.length; m++) {
    if (cell_(masterRows[m], 0).toLowerCase() === lower) {
      masterRowIndex = m; // 0-based within data rows
      detail = {
        nama_penerima: cell_(masterRows[m], 1),
        alamat: cell_(masterRows[m], 2),
        kurir: cell_(masterRows[m], 3),
      };
      break;
    }
  }

  var pickup = {
    timestamp: new Date().toISOString(),
    nama_driver: String(params.nama_driver || "").trim(),
    no_hp: String(params.no_hp || "").trim(),
    kode_pickup: code,
    nama_penerima: String(params.nama_penerima || "").trim() || detail.nama_penerima,
    alamat: String(params.alamat || "").trim() || detail.alamat,
    kurir: String(params.kurir || "").trim() || detail.kurir,
    status: STATUS_DONE,
  };

  historySheet
    .getRange(historySheet.getLastRow() + 1, 1, 1, HISTORY_HEADER.length)
    .setValues([
      [
        pickup.timestamp,
        pickup.nama_driver,
        pickup.no_hp,
        pickup.kode_pickup,
        pickup.nama_penerima,
        pickup.alamat,
        pickup.kurir,
        pickup.status,
      ],
    ]);

  if (masterRowIndex >= 0) {
    // +2: 1 for the header row, 1 to convert 0-based to 1-based.
    masterSheet.getRange(masterRowIndex + 2, 5).setValue(STATUS_DONE);
  }

  return ok_(pickup);
}

function getStats_() {
  var ss = ensureSheets_();
  var masterRows = getRows_(ss.getSheetByName(MASTER_SHEET));
  var historyRows = getRows_(ss.getSheetByName(HISTORY_SHEET));

  var pickedCodes = {};
  var todayCount = 0;
  var drivers = {};
  var today = jakartaDateStr_(new Date());

  for (var i = 0; i < historyRows.length; i++) {
    var kode = cell_(historyRows[i], 3).toLowerCase();
    if (kode) pickedCodes[kode] = true;
    var ts = cell_(historyRows[i], 0);
    var d = new Date(ts);
    if (!isNaN(d.getTime()) && jakartaDateStr_(d) === today) {
      todayCount++;
      var driver = cell_(historyRows[i], 1).toLowerCase();
      if (driver) drivers[driver] = true;
    }
  }

  var totalPackages = masterRows.length;
  var pendingPackages = 0;
  for (var j = 0; j < masterRows.length; j++) {
    var c = cell_(masterRows[j], 0).toLowerCase();
    if (!pickedCodes[c]) pendingPackages++;
  }

  return {
    todayPickup: todayCount,
    activeDrivers: Object.keys(drivers).length,
    totalPackages: totalPackages,
    pendingPackages: pendingPackages,
  };
}

function jakartaDateStr_(date) {
  return Utilities.formatDate(date, TIMEZONE, "yyyy-MM-dd");
}
