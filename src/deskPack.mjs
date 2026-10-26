const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[character]));

const statusClass = status => ({
  Pending: 'pending',
  Submitted: 'submitted',
  Approved: 'approved',
  Paid: 'paid'
}[status] || 'pending');

export function buildDeskPackHtml({
  monthLabel,
  recordedByName,
  generatedOn,
  summary,
  trips
}) {
  const rows = trips.map((trip, index) => `
    <tr>
      <td class="number">${index + 1}</td>
      <td class="nowrap">${escapeHtml(trip.date)}</td>
      <td>${escapeHtml(trip.visitor)}</td>
      <td>${escapeHtml(trip.assignedBy)}</td>
      <td class="route">${escapeHtml(trip.fromLoc)} TO ${escapeHtml(trip.toLoc)}</td>
      <td>${escapeHtml(trip.purpose || '-')}</td>
      <td class="number">${escapeHtml(trip.totalKm)}</td>
      <td class="money">${escapeHtml(trip.petrolAmount)}</td>
      <td class="money">${escapeHtml(trip.parkingFee)}</td>
      <td class="money">${escapeHtml(trip.totalAmount)}</td>
      <td><span class="status ${statusClass(trip.claimStatus)}">${escapeHtml(trip.claimStatus)}</span></td>
    </tr>`).join('');

  const title = `${monthLabel} Petrol Expense Report`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { font-family: Arial, Helvetica, sans-serif; color: #17343d; background: #f3f7f8; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 28px; background: #f3f7f8; }
    .report { width: min(1440px, 100%); margin: 0 auto; overflow: hidden; border: 1px solid #dce6e9; border-radius: 16px; background: #fff; box-shadow: 0 14px 38px rgba(20, 52, 63, .08); }
    .topbar { display: flex; min-height: 68px; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 28px; border-bottom: 1px solid #e1e9eb; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .mark { display: grid; width: 40px; height: 40px; place-items: center; border-radius: 12px; background: linear-gradient(135deg, #0876d1, #079eaa 54%, #238247); color: #fff; font-size: 20px; }
    .brand-name { font-size: 13px; font-weight: 700; }
    .brand-caption { margin-top: 2px; color: #71838a; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; }
    .offline { display: inline-flex; align-items: center; gap: 7px; color: #287260; font-size: 12px; font-weight: 700; white-space: nowrap; }
    .offline-dot { width: 8px; height: 8px; border-radius: 50%; background: #25a47c; }
    .content { padding: 28px; }
    .heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
    .eyebrow { margin: 0 0 5px; color: #087c98; font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
    h1 { margin: 0; color: #173943; font-size: 30px; line-height: 1.2; }
    .subheading { margin: 7px 0 0; color: #71838a; font-size: 13px; }
    .month { flex: 0 0 auto; padding: 8px 12px; border-radius: 9px; background: #eaf7f7; color: #276e6f; font-size: 12px; font-weight: 700; }
    .metrics { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; margin-bottom: 24px; }
    .metric { min-width: 0; padding: 14px; background: #eaf5f7; }
    .metric:last-child { background: #087f99; color: #fff; }
    .metric-label { display: block; color: #647981; font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
    .metric:last-child .metric-label { color: #d9f2f5; }
    .metric-value { display: block; margin-top: 5px; color: #1b3942; font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .metric:last-child .metric-value { color: #fff; }
    .table-title { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
    h2 { margin: 0; font-size: 17px; }
    .trip-count { color: #7b8b91; font-size: 11px; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; color: #344c54; font-size: 12px; text-align: left; }
    th { padding: 10px 8px; border-top: 1px solid #d9e3e6; border-bottom: 1px solid #d9e3e6; color: #6a7e86; font-size: 10px; font-weight: 700; white-space: nowrap; }
    td { padding: 11px 8px; border-bottom: 1px solid #e5ecee; vertical-align: top; }
    tbody tr:nth-child(even) { background: #f8fafb; }
    .route { color: #176d68; white-space: nowrap; }
    .nowrap, .money, .number { white-space: nowrap; }
    .number, .money { font-variant-numeric: tabular-nums; }
    .status { display: inline-flex; align-items: center; gap: 6px; padding: 5px 9px; border-radius: 99px; font-size: 10px; font-weight: 700; white-space: nowrap; }
    .status::before { width: 7px; height: 7px; border-radius: 50%; background: currentColor; content: ''; }
    .pending { background: #fff4dc; color: #946000; }
    .submitted { background: #e7f1ff; color: #3567a5; }
    .approved { background: #e8f7ee; color: #297149; }
    .paid { background: #e7f6f5; color: #166d67; }
    tfoot td { border-bottom: 1px solid #d5e1e5; background: #eff6f7; font-weight: 700; }
    .total-label { text-align: right; }
    .footnote { display: flex; align-items: center; gap: 8px; margin-top: 16px; color: #71838a; font-size: 11px; }
    .footnote-mark { display: inline-grid; width: 17px; height: 17px; place-items: center; border: 1px solid #9aabb0; border-radius: 50%; font-size: 11px; }
    @media (max-width: 760px) {
      body { padding: 10px; }
      .topbar, .content { padding: 16px; }
      .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .metric:last-child { grid-column: span 2; }
      .heading { display: block; }
      .month { display: inline-block; margin-top: 10px; }
      h1 { font-size: 24px; }
      table { min-width: 980px; }
    }
    @media print {
      :root, body { background: #fff; }
      body { padding: 0; }
      .report { width: 100%; border: 0; border-radius: 0; box-shadow: none; }
      .table-wrap { overflow: visible; }
      table { min-width: 0; font-size: 9px; }
      th, td { padding: 6px 4px; }
    }
  </style>
</head>
<body>
  <main class="report">
    <header class="topbar">
      <div class="brand">
        <div class="mark" aria-hidden="true">➤</div>
        <div><div class="brand-name">Trip &amp; Petrol Expense Tracker</div><div class="brand-caption">Boss Desk Pack</div></div>
      </div>
      <div class="offline"><span class="offline-dot" aria-hidden="true"></span>One file · Opens offline</div>
    </header>
    <div class="content">
      <div class="heading">
        <div>
          <p class="eyebrow">Petrol expense report</p>
          <h1>${escapeHtml(monthLabel)}</h1>
          <p class="subheading">Prepared for review by <strong>${escapeHtml(recordedByName || 'Phone user')}</strong> · Generated ${escapeHtml(generatedOn)}</p>
        </div>
        <span class="month">Saved report snapshot</span>
      </div>
      <section class="metrics" aria-label="Report totals">
        <div class="metric"><span class="metric-label">Trips</span><span class="metric-value">${escapeHtml(summary.tripCount)}</span></div>
        <div class="metric"><span class="metric-label">Total KM</span><span class="metric-value">${escapeHtml(summary.totalKm)}</span></div>
        <div class="metric"><span class="metric-label">Petrol Amount</span><span class="metric-value">${escapeHtml(summary.petrolAmount)}</span></div>
        <div class="metric"><span class="metric-label">Parking Fee</span><span class="metric-value">${escapeHtml(summary.parkingFee)}</span></div>
        <div class="metric"><span class="metric-label">Grand Total</span><span class="metric-value">${escapeHtml(summary.grandTotal)}</span></div>
      </section>
      <div class="table-title"><h2>Trips and claim status</h2><span class="trip-count">${escapeHtml(summary.tripCount)} trips · All amounts in ₹</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>No.</th><th>Date</th><th>Visitor / Client</th><th>Assigned Person</th><th>Route</th><th>Purpose</th><th>KM</th><th>Petrol</th><th>Parking</th><th>Total</th><th>Claim Status</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr><td colspan="6" class="total-label">TOTAL</td><td class="number">${escapeHtml(summary.totalKm)}</td><td class="money">${escapeHtml(summary.petrolAmount)}</td><td class="money">${escapeHtml(summary.parkingFee)}</td><td class="money">${escapeHtml(summary.grandTotal)}</td><td></td></tr></tfoot>
        </table>
      </div>
      <div class="footnote"><span class="footnote-mark" aria-hidden="true">i</span>This is a saved snapshot inside this file. It does not connect to the phone or update automatically.</div>
    </div>
  </main>
</body>
</html>`;
}
