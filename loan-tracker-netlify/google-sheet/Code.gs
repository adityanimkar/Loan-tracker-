// Loan Tracker Backend & Two-Way Google Sheets Scanner
// Paste this into Extensions > Apps Script of your Google Sheet.
const SECRET = 'veda1999';

function doGet(e) {
  if (!e || !e.parameter || !e.parameter.k) return ContentService.createTextOutput('Loan Tracker backend is running');
  if (e.parameter.k !== SECRET) return out({ error: 'wrong passphrase' });
  try {
    const scanned = scanSheets();
    return out({ state: JSON.stringify(scanned) });
  } catch(err) {
    return out({ error: err.toString() });
  }
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return out({ error: 'no post data received' });
    const b = JSON.parse(e.postData.contents);
    if (b.k !== SECRET) return out({ error: 'wrong passphrase' });
    
    // Save raw JSON to Data!A1
    sh('Data').getRange('A1').setValue(JSON.stringify(b.state));
    
    // Update visible tables in Loans and Payments sheets
    render(b.state);
    return out({ ok: true });
  } catch(err) {
    return out({ error: err.toString() });
  }
}

function scanSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.getActive();
  if (!ss) throw new Error('Spreadsheet not found');
  
  // 1. Read existing state from Data!A1 if present
  let state = { loans: [], extra: 5000, strat: 'rate', updatedAt: Date.now() };
  try {
    const dataSheet = ss.getSheetByName('Data');
    if (dataSheet) {
      const raw = dataSheet.getRange('A1').getValue();
      if (raw) state = Object.assign(state, JSON.parse(raw));
    }
  } catch(e) {}

  const existingMap = {};
  (state.loans || []).forEach(l => {
    if (l && l.name) existingMap[String(l.name).toLowerCase().trim()] = l;
  });

  // 2. Scan Loans sheet (fallback to Sheet1 if Loans is empty)
  let targetSheet = ss.getSheetByName('Loans');
  if (!targetSheet || targetSheet.getLastRow() < 2) {
    targetSheet = ss.getSheetByName('Sheet1');
  }

  if (targetSheet && targetSheet.getLastRow() >= 2) {
    const data = targetSheet.getDataRange().getValues();
    if (data.length >= 2) {
      const headers = data[0].map(h => String(h).toLowerCase().trim());
      
      const findCol = (keys, fallback) => {
        for (let i = 0; i < headers.length; i++) {
          for (let k of keys) {
            if (headers[i].indexOf(k) !== -1) return i;
          }
        }
        return fallback;
      };

      const nameCol = findCol(['loan', 'name', 'title'], 0);
      const rateCol = findCol(['rate', 'roi', 'interest', '%'], 1);
      const emiCol  = findCol(['emi', 'installment', 'monthly'], 2);
      const balCol  = findCol(['pend', 'bal', 'due', 'outstand', 'principal'], 3);
      const origCol = findCol(['orig', 'sanction', 'total', 'initial'], 4);
      const dayCol  = findCol(['day', 'date'], 5);

      const scannedLoans = [];
      for (let r = 1; r < data.length; r++) {
        const row = data[r];
        const name = String(row[nameCol] || '').trim();
        if (!name) continue;

        const rate = parseFloat(row[rateCol]) || 0;
        const emi  = parseFloat(row[emiCol]) || 0;
        const bal  = parseFloat(row[balCol]) || 0;
        const orig = parseFloat(row[origCol]) || bal;
        const day  = Math.min(28, Math.max(1, Math.round(parseFloat(row[dayCol])) || 5));

        const existing = existingMap[name.toLowerCase()] || {};
        scannedLoans.push({
          id: existing.id || ('l' + (Date.now() + r)),
          name: name,
          rate: rate,
          emi: emi,
          bal: bal,
          orig: orig,
          day: day,
          hist: existing.hist || []
        });
      }

      if (scannedLoans.length > 0) {
        state.loans = scannedLoans;
      }
    }
  }

  // 3. Scan Payments sheet if present
  const paySheet = ss.getSheetByName('Payments');
  if (paySheet && paySheet.getLastRow() >= 2) {
    const payData = paySheet.getDataRange().getValues();
    if (payData.length >= 2) {
      const pHeaders = payData[0].map(h => String(h).toLowerCase().trim());
      const pLoanCol = pHeaders.findIndex(h => h.includes('loan') || h.includes('name'));
      const pTypeCol = pHeaders.findIndex(h => h.includes('type'));
      const pAmtCol  = pHeaders.findIndex(h => h.includes('amount') || h.includes('amt') || h.includes('paid'));
      const pDateCol = pHeaders.findIndex(h => h.includes('date'));
      const pMonCol  = pHeaders.findIndex(h => h.includes('month') || h.includes('mon'));

      const nameToLoan = {};
      state.loans.forEach(l => { nameToLoan[String(l.name).toLowerCase().trim()] = l; });

      const paymentsMap = {};
      for (let r = 1; r < payData.length; r++) {
        const row = payData[r];
        const lName = String(row[pLoanCol >= 0 ? pLoanCol : 0] || '').toLowerCase().trim();
        if (!lName) continue;
        const typeStr = String(row[pTypeCol >= 0 ? pTypeCol : 1] || 'EMI').toLowerCase();
        const amt = parseFloat(row[pAmtCol >= 0 ? pAmtCol : 2]) || 0;
        const date = String(row[pDateCol >= 0 ? pDateCol : 3] || '');
        const mon = String(row[pMonCol >= 0 ? pMonCol : 4] || '');

        if (!paymentsMap[lName]) paymentsMap[lName] = [];
        paymentsMap[lName].push({
          t: typeStr.includes('pre') ? 'pre' : 'emi',
          a: amt,
          d: date,
          m: mon
        });
      }

      Object.keys(paymentsMap).forEach(k => {
        if (nameToLoan[k]) {
          nameToLoan[k].hist = paymentsMap[k];
        }
      });
    }
  }

  return state;
}

function sh(n) {
  const ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.getActive();
  if (!ss) throw new Error('Script must be created from Extensions > Apps Script inside a Google Sheet');
  return ss.getSheetByName(n) || ss.insertSheet(n);
}

function table(name, rows) {
  if (!rows || !rows.length) return;
  const s = sh(name);
  s.clearContents();
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

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
