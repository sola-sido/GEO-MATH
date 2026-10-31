function doGet() {
  return withLock_(function () {
    return json_(readAll_());
  });
}

function doPost(e) {
  return withLock_(function () {
    var data = {};
    try {
      data = JSON.parse(e.postData && e.postData.contents ? e.postData.contents : "{}");
    } catch (err) {
      data = e.parameter || {};
    }
    if (data.op === "note") addNote_(data);
    if (data.op === "like") addLike_(data);
    return json_(readAll_());
  });
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  var locked = false;
  try {
    lock.waitLock(15000);
    locked = true;
    return fn();
  } catch (err) {
    return json_({ notes: [], likes: {}, error: String(err) });
  } finally {
    if (locked) lock.releaseLock();
  }
}

function addNote_(data) {
  var name = clip_(data.name, 20);
  var text = clip_(data.text, 140);
  if (!text) return;
  var sh = sheet_(NOTES_(), ["at", "name", "text"]);
  sh.appendRow([new Date().toISOString(), name, text]);
  var last = sh.getLastRow();
  var extra = last - 201;
  if (extra > 0) sh.deleteRows(2, extra);
}

function addLike_(data) {
  var id = clip_(data.id, 80);
  if (!/^w-[a-z0-9-]+$/.test(id)) return;
  var delta = Number(data.delta) === -1 ? -1 : 1;
  var sh = sheet_(LIKES_(), ["id", "count"]);
  var values = sh.getDataRange().getValues();
  var i;
  for (i = 1; i < values.length; i++) {
    if (String(values[i][0]) === id) {
      var next = Math.max(0, Number(values[i][1] || 0) + delta);
      sh.getRange(i + 1, 2).setValue(next);
      return;
    }
  }
  if (delta > 0) sh.appendRow([id, 1]);
}

function readAll_() {
  var notes = [];
  var nsh = sheet_(NOTES_(), ["at", "name", "text"]);
  var nv = nsh.getDataRange().getValues();
  var i;
  for (i = 1; i < nv.length; i++) {
    if (!nv[i][2]) continue;
    notes.push({
      at: String(nv[i][0]),
      name: String(nv[i][1] || ""),
      text: String(nv[i][2])
    });
  }
  notes.reverse();

  var likes = {};
  var lsh = sheet_(LIKES_(), ["id", "count"]);
  var lv = lsh.getDataRange().getValues();
  for (i = 1; i < lv.length; i++) {
    if (lv[i][0]) likes[String(lv[i][0])] = Number(lv[i][1] || 0);
  }
  return { notes: notes.slice(0, 200), likes: likes };
}

function sheet_(name, headers) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
  }
  return sh;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function clip_(value, max) {
  var text = String(value || "").replace(/^\s+|\s+$/g, "");
  return text.length > max ? text.substring(0, max) : text;
}

function NOTES_() { return "notes"; }
function LIKES_() { return "likes"; }
