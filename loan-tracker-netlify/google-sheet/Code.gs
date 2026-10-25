// Loan Tracker backend. Paste into Extensions > Apps Script of a Google Sheet.
const SECRET = 'veda1999'; // type the same one in the app

function doGet(e) {
  if (!e || !e.parameter || !e.parameter.k) return ContentService.createTextOutput('Loan Tracker backend is running');
  if (e.parameter.k !== SECRET) return out({ error: 'wrong passphrase' });
  try {
    return out({ state: sh('Data').getRange('A1').getValue() || null });
  } catch(err) {
    return out({ error: err.toString() });
  }
}
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return out({ error: 'no post data received' });
    const b = JSON.parse(e.postData.contents);
    if (b.k !== SECRET) return out({ error: 'wrong passphrase' });
    sh('Data').getRange('A1').setValue(JSON.stringify(b.state));
    render(b.state);
    return out({ ok: true });
  } catch(err) {
    return out({ error: err.toString() });
  }
}
function sh(n) {
  const ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.getActive();
  if (!ss) throw new Error('Script must be created from Extensions > Apps Script inside a Google Sheet');
  return ss.getSheetByName(n) || ss.insertSheet(n);
}
function table(name, rows) {
  if (!rows || !rows.length) return;
  const s = sh(name); s.clear();
  s.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  s.getRange(1, 1, 1, rows[0].length).setFontWeight('bold');
  s.setFrozenRows(1);
}
function render(S) {
  if (!S) return;
  const loans = S.loans || [];
  table('Loans', [['Loan', 'Rate %', 'EMI', 'Pending', 'Original', 'Due day']]
    .concat(loans.map(l => [l.name, l.rate, l.emi, l.bal, l.orig, l.day])));
  const pay = [['Loan', 'Type', 'Amount', 'Date', 'Month']];
  loans.forEach(l => (l.hist || []).forEach(h => pay.push([l.name, h.t === 'emi' ? 'EMI' : 'Prepayment', h.a, h.d, h.m])));
  table('Payments', pay);
}
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
