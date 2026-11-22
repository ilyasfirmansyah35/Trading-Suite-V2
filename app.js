// ═══ Trading Suite — Pure localStorage PWA ═══
// No GAS URL. All data saved locally on device.

// ═══ DATABASE (localStorage) ═══
const DB = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } },
  set(key, val) { localStorage.setItem(key, JSON.stringify(val)); },
  uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); },

  getAccounts() { return this.get('ts_accounts'); },
  savAccounts(a) { this.set('ts_accounts', a); },
  getTrades() { return this.get('ts_trades'); },
  savTrades(t) { this.set('ts_trades', t); },
  getSettings() { try { return JSON.parse(localStorage.getItem('ts_settings')) || {}; } catch { return {}; } },
  savSettings(s) { this.set('ts_settings', s); },
};

// ═══ API (same interface — backed by localStorage) ═══
const API = {
  // Accounts
  getAccounts() { return Promise.resolve(DB.getAccounts()); },
  addAccount(d) {
    const accs = DB.getAccounts();
    const a = { ...d, AccountID: DB.uid() };
    accs.push(a); DB.savAccounts(accs);
    if (typeof GDriveSync !== 'undefined') GDriveSync.triggerAutoSync();
    return Promise.resolve({ success: true, id: a.AccountID });
  },
  updateAccount(id, d) {
    const accs = DB.getAccounts().map(a => a.AccountID === id ? { ...a, ...d } : a);
    DB.savAccounts(accs);
    if (typeof GDriveSync !== 'undefined') GDriveSync.triggerAutoSync();
    return Promise.resolve({ success: true });
  },
  deleteAccount(id) {
    DB.savAccounts(DB.getAccounts().filter(a => a.AccountID !== id));
    DB.savTrades(DB.getTrades().filter(t => t.AccountID !== id));
    if (typeof GDriveSync !== 'undefined') GDriveSync.triggerAutoSync();
    return Promise.resolve({ success: true });
  },

  // Trades
  getTrades(accId, filters = {}) {
    let trades = DB.getTrades().filter(t => t.AccountID === accId);
    if (filters.month) trades = trades.filter(t => (t.Date || '').slice(5, 7) === filters.month);
    trades.sort((a, b) => b.Date.localeCompare(a.Date));
    return Promise.resolve(trades);
  },
  addTrade(d) {
    const trades = DB.getTrades();
    const pl = parseFloat(d.ProfitLoss) || 0;
    const t = { ...d, TradeID: DB.uid(), Result: pl > 0 ? 'Win' : pl < 0 ? 'Loss' : 'BE' };
    trades.push(t); DB.savTrades(trades);
    if (typeof GDriveSync !== 'undefined') GDriveSync.triggerAutoSync();
    return Promise.resolve({ success: true });
  },
  updateTrade(id, d) {
    const pl = parseFloat(d.ProfitLoss) || 0;
    const trades = DB.getTrades().map(t => t.TradeID === id ? { ...t, ...d, Result: pl > 0 ? 'Win' : pl < 0 ? 'Loss' : 'BE' } : t);
    DB.savTrades(trades);
    if (typeof GDriveSync !== 'undefined') GDriveSync.triggerAutoSync();
    return Promise.resolve({ success: true });
  },
  deleteTrade(id) {
    DB.savTrades(DB.getTrades().filter(t => t.TradeID !== id));
    if (typeof GDriveSync !== 'undefined') GDriveSync.triggerAutoSync();
    return Promise.resolve({ success: true });
  },

  // Settings
  getSettings() { return Promise.resolve(DB.getSettings()); },
  updateSettings(d) {
    DB.savSettings({ ...DB.getSettings(), ...d });
    if (typeof GDriveSync !== 'undefined') GDriveSync.triggerAutoSync();
    return Promise.resolve({ success: true });
  },

  // Stats — calculated locally
  getStats(accId) {
    const acc = DB.getAccounts().find(a => a.AccountID === accId) || {};
    const all = DB.getTrades().filter(t => t.AccountID === accId);
    const today = new Date().toISOString().slice(0, 10);

    // Summary
    const wins = all.filter(t => t.Result === 'Win');
    const losses = all.filter(t => t.Result === 'Loss');
    const totalProfit = wins.reduce((s, t) => s + (parseFloat(t.ProfitLoss) || 0), 0);
    const totalLoss = Math.abs(losses.reduce((s, t) => s + (parseFloat(t.ProfitLoss) || 0), 0));
    const netProfit = all.reduce((s, t) => s + (parseFloat(t.ProfitLoss) || 0), 0);
    const init = parseFloat(acc.InitialBalance) || 0;
    const pls = all.map(t => parseFloat(t.ProfitLoss) || 0);
    const bestTrade = pls.length ? Math.max(...pls) : 0;
    const worstTrade = pls.length ? Math.min(...pls) : 0;
    const pf = totalLoss > 0 ? (totalProfit / totalLoss).toFixed(2) : totalProfit > 0 ? '∞' : '0';

    // Drawdown
    let peak = init, maxDD = 0, bal = init;
    all.slice().sort((a, b) => a.Date.localeCompare(b.Date)).forEach(t => {
      bal += parseFloat(t.ProfitLoss) || 0;
      if (bal > peak) peak = bal;
      const dd = peak - bal;
      if (dd > maxDD) maxDD = dd;
    });

    // Daily
    const todayTrades = all.filter(t => t.Date === today);
    const todayProfit = todayTrades.reduce((s, t) => s + (parseFloat(t.ProfitLoss) || 0), 0);
    const todayWins = todayTrades.filter(t => t.Result === 'Win').length;
    const todayLosses = todayTrades.filter(t => t.Result === 'Loss').length;
    const todayLossTotal = Math.abs(todayTrades.filter(t => t.Result === 'Loss').reduce((s, t) => s + (parseFloat(t.ProfitLoss) || 0), 0));

    let dailyTarget = parseFloat(acc.DailyTarget) || 0;
    const pct = parseFloat(acc.DailyTargetPct) || 0;
    if (pct > 0) dailyTarget = (init + netProfit - todayProfit) * pct / 100;
    const dailyLossLimit = parseFloat(acc.DailyLossLimit) || 0;
    const targetProgress = dailyTarget > 0 ? Math.min((todayProfit / dailyTarget) * 100, 100) : 0;
    const targetReached = dailyTarget > 0 && todayProfit >= dailyTarget;
    const lossLimitReached = dailyLossLimit > 0 && todayLossTotal >= dailyLossLimit;
    let tradingStatus = 'Trading Berjalan';
    if (lossLimitReached) tradingStatus = '⛔ Loss Limit Tercapai';
    else if (targetReached) tradingStatus = '🎯 Target Tercapai!';

    // Charts — equity
    const sorted = all.slice().sort((a, b) => a.Date.localeCompare(b.Date));
    const eqMap = {};
    let running = init;
    sorted.forEach(t => {
      running += parseFloat(t.ProfitLoss) || 0;
      eqMap[t.Date] = running - init;
    });
    const eqLabels = Object.keys(eqMap);
    const eqData = Object.values(eqMap);

    // Monthly
    const mnMap = {};
    sorted.forEach(t => {
      const key = (t.Date || '').slice(0, 7);
      if (key) mnMap[key] = (mnMap[key] || 0) + (parseFloat(t.ProfitLoss) || 0);
    });

    // Daily P/L map for calendar
    const dayMap = {};
    sorted.forEach(t => {
      const d = t.Date;
      if (d) dayMap[d] = (dayMap[d] || 0) + (parseFloat(t.ProfitLoss) || 0);
    });
    const dayLabels = Object.keys(dayMap).sort();
    const dayData = dayLabels.map(d => Math.round(dayMap[d] * 100) / 100);

    return Promise.resolve({
      summary: {
        winRate: all.length > 0 ? ((wins.length / all.length) * 100).toFixed(1) : 0,
        totalTrade: all.length, totalProfit, totalLoss: -totalLoss,
        netProfit, currentBalance: init + netProfit, initialBalance: init,
        bestTrade, worstTrade, profitFactor: pf, drawdown: -maxDD
      },
      daily: {
        todayProfit, todayWins, todayLosses, totalTrade: todayTrades.length,
        dailyTarget, dailyLossLimit, targetProgress, targetReached, lossLimitReached,
        todayLossTotal, tradingStatus
      },
      charts: {
        equity: { labels: eqLabels, data: eqData },
        daily: { labels: dayLabels, data: dayData },
        monthly: { labels: Object.keys(mnMap), data: Object.values(mnMap) },
        winLoss: { win: wins.length, loss: losses.length, be: all.filter(t => t.Result === 'BE').length }
      }
    });
  },

  // Exchange rate — free public API, no GAS
  async getLiveRate() {
    try {
      const r = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      const d = await r.json();
      return { rate: d.rates?.IDR || 15800 };
    } catch {
      try {
        const r2 = await fetch('https://api.frankfurter.app/latest?from=USD&to=IDR');
        const d2 = await r2.json();
        return { rate: d2.rates?.IDR || 15800 };
      } catch { return { rate: 15800 }; }
    }
  },

  calculateLot(p) {
    const { balance, riskMode, risk, sl, currency, rate } = p;
    const r = parseFloat(rate) || 15800;
    let riskUSD = riskMode === 'percent'
      ? (parseFloat(balance) * parseFloat(risk) / 100) / (currency === 'IDR' ? r : 1)
      : parseFloat(risk) / (currency === 'IDR' ? r : 1);
    const lot = Math.max(0.01, Math.floor((riskUSD / (parseFloat(sl) * 10)) * 100) / 100);
    return Promise.resolve({ success: true, lot, riskUSD, pipValue: lot * 10 });
  },
};

// ═══ APP ═══
const App = {
  state: { currentAccountId: null, currentAccount: null, accounts: [], settings: {} },

  fmt(v, cur) {
    const n = parseFloat(v) || 0, abs = Math.abs(n);
    const s = abs % 1 === 0 ? abs.toLocaleString('id-ID') : abs.toLocaleString('id-ID', { maximumFractionDigits: 2 });
    if (cur === 'Cent') return (n < 0 ? '-' : '') + s + ' Cent';
    if (cur === 'USD') return (n < 0 ? '-$' : '$') + s;
    return (n < 0 ? '-' : '') + 'Rp ' + s;
  },

  fmtDate(str) {
    if (!str) return '';
    return new Date(str + 'T00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  },

  today() { return new Date().toISOString().slice(0, 10); },

  toast(msg, duration = 3000) {
    const el = document.getElementById('toastMsg');
    if (!el) return;
    el.textContent = msg; el.classList.add('show');
    clearTimeout(App._tt);
    App._tt = setTimeout(() => el.classList.remove('show'), duration);
  },

  openSheet(id) { document.getElementById(id)?.classList.add('open'); },
  closeSheet(id) { document.getElementById(id)?.classList.remove('open'); },

  async downloadPDF() {
    const btn = event?.target?.closest('button');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="loader-gold" style="display:inline-block;width:14px;height:14px;border-width:2px"></span> Membuat PDF...'; }
    try {
      // Load jsPDF
      if (!window.jspdf) {
        await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
        await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
      }
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const acc = App.state.currentAccount;
      const cur = acc ? acc.Currency : 'IDR';
      const accId = App.state.currentAccountId;
      const trades = DB.getTrades().filter(t => t.AccountID === accId).sort((a, b) => b.Date.localeCompare(a.Date));
      const stats = await API.getStats(accId);
      const s = stats.summary;
      const now = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

      // Header bar
      doc.setFillColor(12, 13, 16);
      doc.rect(0, 0, 210, 38, 'F');
      doc.setTextColor(212, 255, 0);
      doc.setFontSize(20); doc.setFont('helvetica', 'bold');
      doc.text('Trading Suite', 14, 18);
      doc.setFontSize(10); doc.setFont('helvetica', 'normal');
      doc.setTextColor(180, 180, 180);
      doc.text((acc ? acc.Name : '') + ' · ' + cur, 14, 27);
      doc.text('Dicetak: ' + now, 14, 34);
      doc.setTextColor(212, 255, 0);
      doc.setFontSize(8);
      doc.text('PRO EDITION', 196, 18, { align: 'right' });

      // Summary
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(11); doc.setFont('helvetica', 'bold');
      doc.text('Ringkasan Akun', 14, 50);
      doc.autoTable({
        startY: 54,
        head: [['Metrik', 'Nilai']],
        body: [
          ['Saldo Saat Ini', App.fmt(s.currentBalance, cur)],
          ['Net P/L', (s.netProfit >= 0 ? '+' : '') + App.fmt(s.netProfit, cur)],
          ['Win Rate', s.winRate + '%'],
          ['Total Trade', String(s.totalTrade)],
          ['Total Profit', App.fmt(s.totalProfit, cur)],
          ['Total Loss', App.fmt(s.totalLoss, cur)],
          ['Best Trade', App.fmt(s.bestTrade, cur)],
          ['Worst Trade', App.fmt(s.worstTrade, cur)],
        ],
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [9, 13, 22], textColor: [245, 200, 66], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 248, 248] },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 }, 1: { cellWidth: 'auto' } },
        margin: { left: 14, right: 14 }
      });

      // Trades table
      const fy = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(11); doc.setFont('helvetica', 'bold');
      doc.text('Riwayat Transaksi (' + trades.length + ' data)', 14, fy);
      doc.autoTable({
        startY: fy + 4,
        head: [['Tanggal', 'Metode', 'Profit/Loss', 'Hasil', 'Catatan']],
        body: trades.map(t => [
          t.Date ? new Date(t.Date + 'T00:00').toLocaleDateString('id-ID') : '',
          t.Entry || '—',
          (parseFloat(t.ProfitLoss) > 0 ? '+' : '') + App.fmt(t.ProfitLoss, cur),
          t.Result || '—',
          t.PsychologyNotes || ''
        ]),
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [9, 13, 22], textColor: [245, 200, 66], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        columnStyles: { 0: { cellWidth: 26 }, 1: { cellWidth: 28 }, 2: { cellWidth: 32, halign: 'right' }, 3: { cellWidth: 18, halign: 'center' }, 4: { cellWidth: 'auto' } },
        didParseCell(data) {
          if (data.section === 'body' && data.column.index === 3) {
            if (data.cell.raw === 'Win') data.cell.styles.textColor = [5, 150, 105];
            else if (data.cell.raw === 'Loss') data.cell.styles.textColor = [220, 38, 38];
          }
          if (data.section === 'body' && data.column.index === 2) {
            const v = parseFloat((data.cell.raw || '').replace(/[^0-9.-]/g, ''));
            data.cell.styles.textColor = v > 0 ? [5, 150, 105] : v < 0 ? [220, 38, 38] : [80, 80, 80];
          }
        },
        margin: { left: 14, right: 14 }
      });

      // Footer on each page
      const pages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFontSize(7); doc.setTextColor(150, 150, 150);
        doc.text('Trading Suite · Hlm ' + i + '/' + pages, 14, 289);
        doc.text('⚠️ Trading emas mengandung risiko tinggi', 196, 289, { align: 'right' });
      }

      const fname = 'Trading-Suite-' + (acc ? acc.Name.replace(/\s+/g, '-') : 'Report') + '-' + new Date().toISOString().slice(0, 10) + '.pdf';
      doc.save(fname);
      App.toast('✅ PDF berhasil didownload!');
    } catch (e) { App.toast('❌ Gagal buat PDF: ' + e.message); }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-file-earmark-pdf-fill"></i> Download PDF'; }
  },

  confirmDelete(cb) {
    document.getElementById('confirmDeleteBtn').onclick = async () => { this.closeSheet('deleteSheet'); await cb(); };
    this.openSheet('deleteSheet');
  },

  go(page) {
    ['dashboard', 'calculator', 'trades', 'settings'].forEach(p => {
      document.getElementById('page-' + p).classList.toggle('d-none', p !== page);
      document.getElementById('nav-' + p)?.classList.toggle('active', p === page);
    });
    const tb = document.getElementById('mainTopbar');
    if (tb) tb.style.display = (page === 'dashboard' || page === 'calculator' || page === 'trades' || page === 'settings') ? 'none' : 'flex';
    if (page === 'dashboard') Dashboard.render();
    if (page === 'trades') Trades.render();
    if (page === 'calculator') Calculator.render();
    if (page === 'settings') Settings.render();
  },

  setAccount(id) {
    this.state.currentAccountId = id;
    this.state.currentAccount = this.state.accounts.find(a => a.AccountID === id) || null;
    const acc = this.state.currentAccount;
    document.getElementById('topbarSub').textContent = acc ? acc.Name + ' · ' + acc.Currency : 'Pilih Akun';
  },

  openAccountPicker() {
    document.getElementById('accPickerList').innerHTML = this.state.accounts.map(a => {
      const ic = (a.Icon && typeof a.Icon === 'string') ? a.Icon.trim() : 'bi-wallet2';
      const ih = ic.startsWith('data:') ? `<img src="${ic}" style="width:28px;height:28px;border-radius:7px;object-fit:cover"/>`
        : `<i class="bi ${ic}"></i>`;
      return `<div class="acc-pick-item ${a.AccountID === this.state.currentAccountId ? 'active' : ''}" onclick="App.selectAccount('${a.AccountID}')">
        <div class="acc-icon-box" style="width:36px;height:36px">${ih}</div>
        <div style="flex:1;min-width:0"><div style="font-weight:700;font-size:14px">${a.Name}</div>
          <div style="font-size:11px;color:var(--text2)">${a.Currency} · ${a.Status}</div></div>
        ${a.AccountID === this.state.currentAccountId ? '<i class="bi bi-check-circle-fill t-gold"></i>' : ''}
      </div>`;
    }).join('');
    this.openSheet('accPickerSheet');
  },

  selectAccount(id) {
    this.setAccount(id);
    this.closeSheet('accPickerSheet');
    Dashboard.render();
    if (!document.getElementById('page-trades').classList.contains('d-none')) Trades.render();
  },

  async init() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => { });
    const savedScale = localStorage.getItem('ts_font_scale') || 100;
    if (typeof Settings !== 'undefined' && Settings.applyFontScale) {
      Settings.applyFontScale(savedScale);
    }
    this.state.accounts = DB.getAccounts();
    this.state.settings = DB.getSettings();
    if (this.state.accounts.length > 0) this.setAccount(this.state.accounts[0].AccountID);
    else document.getElementById('topbarSub').textContent = 'Buat akun di Pengaturan';
    document.getElementById('saveTradeBtn').onclick = () => Trades.saveTrade();
    document.getElementById('tradePL').addEventListener('input', e => Trades.updatePreview(e.target.value));
    document.getElementById('tradeAccount').addEventListener('change', () => Trades.updateCurrencyLabel());
    Calculator.fetchRate();
    const tb = document.getElementById('mainTopbar'); if (tb) tb.style.display = 'none';

    // Initialize Google Drive Sync
    if (typeof GDriveSync !== 'undefined') {
      await GDriveSync.init();
      // Show login modal on first visit if not signed in
      const dismissed = sessionStorage.getItem('ts_login_dismissed');
      if (!GDriveSync.isLoggedIn() && !dismissed) {
        GDriveSync.showLoginModal();
      }
    }

    await Dashboard.render();

    // Modern PWA splash screen progress ticker and smooth exit
    const ls = document.getElementById('loadingScreen');
    const statusEl = document.getElementById('pwaLoadingStatus');
    if (statusEl) {
      setTimeout(() => { statusEl.textContent = 'Memuat analitik & kalkulator...'; }, 400);
      setTimeout(() => { statusEl.textContent = 'Menyiapkan akun & jurnal...'; }, 900);
      setTimeout(() => { statusEl.textContent = 'Sistem Siap!'; }, 1400);
    }
    if (ls) {
      setTimeout(() => {
        ls.classList.add('fade-out');
        setTimeout(() => {
          ls.style.display = 'none';
        }, 550);
      }, 1600);
    }
  }
};

// ═══ DASHBOARD ═══
const Dashboard = {
  loadChartJS() {
    return new Promise(resolve => {
      if (typeof Chart !== 'undefined') { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js';
      s.onload = resolve; s.onerror = resolve; document.head.appendChild(s);
    });
  },
  fmtMonth(str) {
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
    const [y, mo] = (str || '').split('-');
    return mo ? m[parseInt(mo) - 1] + " '" + (y || '').slice(2) : str;
  },
  fmtDay(str) {
    if (!str) return '';
    const d = new Date(str + 'T00:00'), m = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
    return d.getDate() + ' ' + m[d.getMonth()];
  },

  async render() {
    const el = document.getElementById('page-dashboard');
    el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;padding:40px;gap:12px;color:var(--text3)"><div class="loader-gold"></div><span>Memuat...</span></div>`;
    if (!App.state.currentAccountId) {
      el.innerHTML = `<div class="empty-state fade-up"><div class="empty-state-icon"><i class="bi bi-person-slash"></i></div><h3>Belum ada akun</h3><p>Buat akun di <strong>Pengaturan</strong>.</p><button class="gold-btn" style="width:auto;padding:12px 24px;margin:16px auto 0" onclick="App.go('settings')"><i class="bi bi-sliders me-1"></i>Buka Pengaturan</button></div>`;
      return;
    }
    const [stats] = await Promise.all([API.getStats(App.state.currentAccountId), this.loadChartJS()]);
    this.build(stats, el);
  },

  build(stats, el) {
    const s = stats.summary, d = stats.daily, c = stats.charts;
    const acc = App.state.currentAccount, cur = acc ? acc.Currency : 'IDR';
    const fmt = v => App.fmt(v, cur);
    const netPct = s.initialBalance > 0 ? ((s.netProfit / s.initialBalance) * 100).toFixed(2) : '0.00';
    const rateText = Calculator._rate ? `$1 = Rp ${Math.round(Calculator._rate).toLocaleString('id-ID')}` : '$1 = Rp 16.250';

    // Recent trades for "Trade Terakhir"
    const allTrades = DB.getTrades().filter(t => t.AccountID === App.state.currentAccountId).sort((a, b) => b.Date.localeCompare(a.Date));
    const recentTrades = allTrades.slice(0, 2);
    let recentTradesHtml = '';
    if (recentTrades.length > 0) {
      recentTradesHtml = recentTrades.map(t => {
        const pSym = (t.Pair || t.Entry || 'XAU').replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase() || 'XAU';
        const isWin = t.Result === 'Win';
        return `<div class="recent-trade-card">
          <div class="rtc-icon">${pSym}</div>
          <div class="rtc-info">
            <div class="rtc-title">${t.Pair || 'XAUUSD'} · ${(t.Type || (isWin ? 'BUY' : 'SELL')).toUpperCase()} ${t.Lot ? t.Lot : '0.50'}</div>
            <div class="rtc-sub">${App.fmtDate(t.Date)} · ${t.Entry || 'London SMC'}</div>
          </div>
          <div class="rtc-right">
            <div class="rtc-pl ${isWin ? 't-win' : 't-loss'}">${t.ProfitLoss > 0 ? '+' : ''}${fmt(t.ProfitLoss)}</div>
            <div class="rtc-rr ${isWin ? 't-win' : 't-loss'}">${isWin ? 'RR 1:2.8' : 'Loss'}</div>
          </div>
        </div>`;
      }).join('');
    } else {
      recentTradesHtml = `
        <div style="background:#F8FAFC;border:1px dashed #CBD5E1;border-radius:14px;padding:22px 14px;text-align:center;margin-top:6px">
          <div style="font-size:12px;font-weight:700;color:#0F172A;margin-bottom:2px">Belum Ada Catatan Trade</div>
          <div style="font-size:10px;color:#64748B;margin-bottom:12px">Catatan trade terbaru Anda akan muncul di sini</div>
          <button class="dash-pill-btn primary" style="margin:0 auto;display:inline-flex;padding:7px 18px;font-size:11px" onclick="Trades.openAddModal()">
            <i class="bi bi-plus-lg me-1"></i> Tambah Trade
          </button>
        </div>`;
    }

    const hasChart = typeof Chart !== 'undefined';

    el.innerHTML = `<div class="fade-up">
      <!-- 01 · DASHBOARD HERO HEADER (FIGCRAFT EXACT) -->
      <div class="dash-hero-header">
        <div class="dash-top-row">
          <div class="dash-brand">
            <div class="dash-brand-title">Trading Suite</div>
            <div class="dash-brand-sub">Copyright By PimenFx</div>
          </div>
          <div class="dash-top-actions">
            <div class="dash-rate-pill" onclick="Calculator.fetchRate()">
              <span class="rate-dot"></span>
              <span id="dashRatePillText">${rateText}</span>
            </div>
            <button class="dash-switch-btn" onclick="App.openAccountPicker()" title="Pilih Akun">
              <i class="bi bi-sliders"></i>
            </button>
          </div>
        </div>

        <div class="dash-balance-block">
          <div class="dash-balance-label">Saldo Saat Ini · ${acc ? acc.Name : 'Main Account'}</div>
          <div class="dash-balance-val">${fmt(s.currentBalance)}</div>
          <div class="dash-net-pl ${s.netProfit >= 0 ? 't-win' : 't-loss'}">
            ${s.netProfit >= 0 ? '▲ +' : '▼ -'}${fmt(Math.abs(s.netProfit))} (${netPct}%) net P/L
          </div>
        </div>

        <div class="dash-actions-row">
          <button class="dash-pill-btn primary" onclick="Trades.openAddModal()"><i class="bi bi-plus-lg"></i> Trade</button>
          ${acc && acc.metaApiAccountId ? `
            <button class="dash-pill-btn" onclick="MetaApiSync.quickSyncCurrentAccount()" title="Sync Transaksi MT5" style="border-color:rgba(255,215,0,0.5);color:#D4AF37">
              <i class="bi bi-arrow-repeat me-1"></i>Sync MT5
            </button>
          ` : ''}
          <button class="dash-pill-btn" onclick="App.go('calculator')">Kalkulator</button>
          <button class="dash-pill-btn" onclick="App.downloadPDF()">Export PDF</button>
        </div>
      </div>

      <!-- DASHBOARD CONTENT BODY -->
      <div class="dash-content-body">
        <!-- PROGRES HARI INI CARD -->
        <div class="daily-progress-card">
          <div class="dpc-top">
            <span class="dpc-label">PROGRES HARI INI</span>
            <span class="dpc-val ${d.todayProfit >= 0 ? 't-win' : 't-loss'}">${d.todayProfit >= 0 ? '+' : ''}${fmt(d.todayProfit)}</span>
          </div>
          <div class="dpc-metric">
            <div class="dpc-text">Target Harian: ${fmt(d.dailyTarget || (s.initialBalance * 0.05))} (${Math.round(d.targetProgress)}%)</div>
            <div class="dpc-bar-wrap"><div class="dpc-bar-fill target" style="width:${Math.min(d.targetProgress, 100)}%"></div></div>
          </div>
          <div class="dpc-metric" style="margin-top:8px">
            <div class="dpc-text">Batas Loss Harian: ${fmt(d.dailyLossLimit || (s.initialBalance * 0.03))} (${d.lossLimitReached ? 'Loss Limit' : 'Aman · ' + Math.round((d.todayLossTotal / (d.dailyLossLimit || 1)) * 100) + '%'})</div>
            <div class="dpc-bar-wrap"><div class="dpc-bar-fill loss" style="width:${Math.min((d.todayLossTotal / (d.dailyLossLimit || 1)) * 100, 100)}%"></div></div>
          </div>
          <div class="dpc-badges-row">
            <span class="badge-pill-win"><i class="bi bi-check-lg me-1"></i>${d.todayWins} Win</span>
            <span class="badge-pill-loss"><i class="bi bi-x-lg me-1"></i>${d.todayLosses} Loss</span>
            <span class="badge-pill-status"><span class="status-dot"></span>${d.lossLimitReached ? 'Loss Limit' : (d.targetReached ? 'Target Tercapai!' : 'Boleh Trading')}</span>
          </div>
        </div>

        <!-- 2x2 STAT GRID -->
        <div class="stat-grid-fig">
          <div class="stat-card-fig">
            <div class="scf-title">Win Rate</div>
            <div class="scf-val t-win">${s.winRate}%</div>
            <div class="scf-sub">▲ +${s.winRate}% bln ini</div>
          </div>
          <div class="stat-card-fig">
            <div class="scf-title">Profit Factor</div>
            <div class="scf-val">${s.profitFactor}</div>
            <div class="scf-sub">Target > 2.0</div>
          </div>
          <div class="stat-card-fig">
            <div class="scf-title">Max Drawdown</div>
            <div class="scf-val t-loss">${Math.abs(s.drawdown) > 0 ? fmt(s.drawdown) : '0%'}</div>
            <div class="scf-sub">Batas aman < 10%</div>
          </div>
          <div class="stat-card-fig">
            <div class="scf-title">Best Trade</div>
            <div class="scf-val t-win">${s.bestTrade > 0 ? '+' + fmt(s.bestTrade) : fmt(s.bestTrade)}</div>
            <div class="scf-sub">${acc ? acc.Name : 'XAUUSD Buy'}</div>
          </div>
        </div>

        <!-- TRADE TERAKHIR SECTION -->
        <div class="recent-trades-sec">
          <div class="recent-header-row">
            <div class="recent-title">Trade Terakhir</div>
            <a href="javascript:void(0)" onclick="App.go('trades')" class="see-more-link">Lihat Semua</a>
          </div>
          <div class="recent-trades-list">
            ${recentTradesHtml}
          </div>
        </div>

        <!-- DAILY CALENDAR -->
        <div class="chart-card" id="calendarPanel">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
            <div style="display:flex;align-items:center;gap:8px">
              <div style="width:8px;height:8px;border-radius:50%;background:var(--gold);box-shadow:0 0 6px var(--gold)"></div>
              <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--text3)">Catatan Harian</span>
            </div>
            <div style="display:flex;align-items:center;gap:12px">
              <button class="cal-nav-btn" onclick="Dashboard.calPrev()"><i class="bi bi-chevron-left"></i></button>
              <span id="calMonthLabel" style="font-size:13px;font-weight:700;color:var(--text);min-width:100px;text-align:center"></span>
              <button class="cal-nav-btn" onclick="Dashboard.calNext()"><i class="bi bi-chevron-right"></i></button>
            </div>
          </div>
          <div class="cal-weekdays">
            <div>Min</div><div>Sen</div><div>Sel</div><div>Rab</div><div>Kam</div><div>Jum</div><div>Sab</div>
          </div>
          <div class="cal-grid" id="calGrid"></div>
          <div id="calSummary" style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap"></div>
        </div>

        ${hasChart ? `
        <div class="chart-card"><div style="display:flex;align-items:center;gap:8px;margin-bottom:16px"><div style="width:8px;height:8px;border-radius:50%;background:var(--gold);box-shadow:0 0 6px var(--gold)"></div><span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--text3)">Equity Curve</span></div><canvas id="eqChart" height="130"></canvas></div>
        <div class="chart-card"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px"><div style="display:flex;align-items:center;gap:8px"><div style="width:8px;height:8px;border-radius:50%;background:var(--gold);box-shadow:0 0 6px var(--gold)"></div><span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--text3)">P/L per Bulan</span></div><span style="font-size:10px;color:var(--text3)">${c.monthly.labels.length} bulan</span></div><canvas id="mnChart" height="130"></canvas></div>
        <div class="chart-card"><div style="display:flex;align-items:center;gap:8px;margin-bottom:16px"><div style="width:8px;height:8px;border-radius:50%;background:var(--win);box-shadow:0 0 6px var(--win)"></div><span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--text3)">Distribusi Hasil</span></div>
          <div style="display:flex;align-items:center;gap:16px"><div style="flex:1"><canvas id="wlChart" width="150" height="150"></canvas></div>
            <div style="display:flex;flex-direction:column;gap:10px;min-width:100px">
              <div class="wl-legend-item" style="color:var(--win)"><div class="wl-dot" style="background:var(--win)"></div><span class="wl-label">Win</span><span class="wl-cnt">${c.winLoss.win}</span></div>
              <div class="wl-legend-item" style="color:var(--loss)"><div class="wl-dot" style="background:var(--loss)"></div><span class="wl-label">Loss</span><span class="wl-cnt">${c.winLoss.loss}</span></div>
              <div class="wl-legend-item" style="color:var(--be)"><div class="wl-dot" style="background:var(--be)"></div><span class="wl-label">BE</span><span class="wl-cnt">${c.winLoss.be}</span></div>
            </div></div></div>`: ''}
      </div>
    </div>`;
    // Store daily data for calendar & render it
    this._chartDaily = c.daily;
    this._currency = cur;
    const now = new Date();
    if (!this._calYear) { this._calYear = now.getFullYear(); this._calMonth = now.getMonth(); }
    setTimeout(() => this.renderCalendar(), 50);
    if (hasChart) setTimeout(() => this.drawCharts(c), 150);
  },

  // ── Calendar Panel ──
  calPrev() {
    this._calMonth--;
    if (this._calMonth < 0) { this._calMonth = 11; this._calYear--; }
    this.renderCalendar();
  },
  calNext() {
    this._calMonth++;
    if (this._calMonth > 11) { this._calMonth = 0; this._calYear++; }
    this.renderCalendar();
  },
  renderCalendar() {
    const year = this._calYear, month = this._calMonth;
    const monthNames = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    const label = document.getElementById('calMonthLabel');
    if (label) label.textContent = monthNames[month] + ' ' + year;

    const dailyMap = {};
    if (this._chartDaily && this._chartDaily.labels) {
      this._chartDaily.labels.forEach((d, i) => { dailyMap[d] = this._chartDaily.data[i]; });
    }

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = new Date().toISOString().slice(0, 10);
    const cur = this._currency || 'IDR';
    const fmt = v => App.fmt(v, cur);

    let html = '';
    let totalProfit = 0, totalLoss = 0, winDays = 0, lossDays = 0;

    for (let i = 0; i < firstDay; i++) html += '<div class="cal-cell empty"></div>';

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      const pl = dailyMap[dateStr];
      const isToday = dateStr === todayStr;
      let cls = 'cal-cell', valHtml = '';

      if (pl !== undefined && pl !== 0) {
        if (pl > 0) { cls += ' cal-win'; totalProfit += pl; winDays++; }
        else { cls += ' cal-loss'; totalLoss += Math.abs(pl); lossDays++; }
        const abs = Math.abs(pl);
        let disp;
        if (cur === 'Cent') {
          disp = (pl > 0 ? '+' : '-') + (abs >= 1000 ? Math.round(abs) : abs.toFixed(2));
        } else {
          if (abs >= 1000000) disp = (pl > 0 ? '+' : '-') + (abs / 1000000).toFixed(1) + 'jt';
          else if (abs >= 1000) disp = (pl > 0 ? '+' : '-') + (abs / 1000).toFixed(abs >= 10000 ? 0 : 1) + 'k';
          else disp = (pl > 0 ? '+' : '-') + abs;
        }
        valHtml = '<div class="cal-val">' + disp + '</div>';
      } else if (pl === 0) {
        cls += ' cal-be';
        valHtml = '<div class="cal-val" style="color:var(--be)">BE</div>';
      }
      if (isToday) cls += ' cal-today';

      html += '<div class="' + cls + '"><div class="cal-day' + (isToday ? ' today-dot' : '') + '">' + day + '</div>' + valHtml + '</div>';
    }

    const grid = document.getElementById('calGrid');
    if (grid) grid.innerHTML = html;

    const net = totalProfit - totalLoss;
    const summaryEl = document.getElementById('calSummary');
    if (summaryEl) {
      summaryEl.innerHTML =
        '<div class="cal-summary-chip win"><i class="bi bi-caret-up-fill"></i> ' + winDays + ' hari profit</div>' +
        '<div class="cal-summary-chip loss"><i class="bi bi-caret-down-fill"></i> ' + lossDays + ' hari loss</div>' +
        '<div class="cal-summary-chip ' + (net >= 0 ? 'win' : 'loss') + '">Net: ' + (net >= 0 ? '+' : '') + fmt(Math.round(net * 100) / 100) + '</div>';
    }
  },

  drawCharts(c) {
    ['eqChart', 'mnChart', 'wlChart'].forEach(id => { const i = Chart.getChart(id); if (i) i.destroy(); });
    const gr = 'rgba(15, 23, 42, 0.05)', tk = '#64748B';
    const tt = { backgroundColor: 'rgba(18, 18, 20, 0.95)', borderColor: 'rgba(212, 255, 0, 0.3)', borderWidth: 1, titleColor: '#94A3B8', bodyColor: '#FFFFFF', bodyFont: { family: "'Outfit',sans-serif", weight: '700', size: 14 }, padding: 12, cornerRadius: 10 };
    const sc = { x: { grid: { color: gr, drawBorder: false }, ticks: { color: tk, font: { size: 10 }, maxTicksLimit: 7 } }, y: { grid: { color: gr, drawBorder: false }, ticks: { color: tk, font: { size: 10 }, maxTicksLimit: 5 } } };
    const eqLast = c.equity.data.length > 0 ? c.equity.data[c.equity.data.length - 1] : 0;
    const eqC = eqLast >= 0 ? '#10B981' : '#EE4444', eqB = eqLast >= 0 ? 'rgba(16, 185, 129, 0.08)' : 'rgba(238, 68, 68, 0.08)';
    new Chart(document.getElementById('eqChart'), { type: 'line', data: { labels: c.equity.labels.map(l => this.fmtDay(l)), datasets: [{ data: c.equity.data, fill: true, tension: 0.45, borderColor: eqC, backgroundColor: eqB, borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: eqC }] }, options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false }, tooltip: tt }, scales: sc } });
    new Chart(document.getElementById('mnChart'), { type: 'bar', data: { labels: c.monthly.labels.map(l => this.fmtMonth(l)), datasets: [{ data: c.monthly.data, backgroundColor: c.monthly.data.map(v => v >= 0 ? 'rgba(16, 185, 129, 0.75)' : 'rgba(238, 68, 68, 0.75)'), borderColor: c.monthly.data.map(v => v >= 0 ? '#10B981' : '#EE4444'), borderWidth: 1.5, borderRadius: 7, borderSkipped: false }] }, options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false }, tooltip: tt }, scales: { x: { grid: { color: gr, drawBorder: false }, ticks: { color: tk, font: { size: 11 } } }, y: { grid: { color: gr, drawBorder: false }, ticks: { color: tk, font: { size: 10 }, maxTicksLimit: 5 } } } } });
    const tot = c.winLoss.win + c.winLoss.loss + c.winLoss.be;
    new Chart(document.getElementById('wlChart'), { type: 'doughnut', data: { labels: ['Win', 'Loss', 'BE'], datasets: [{ data: tot > 0 ? [c.winLoss.win, c.winLoss.loss, c.winLoss.be] : [1, 0, 0], backgroundColor: ['rgba(16,185,129,.8)', 'rgba(244,63,94,.8)', 'rgba(245,158,11,.8)'], borderColor: ['#10b981', '#f43f5e', '#f59e0b'], borderWidth: 2, hoverOffset: 8, spacing: 2 }] }, options: { responsive: true, maintainAspectRatio: true, cutout: '68%', plugins: { legend: { display: false }, tooltip: tt } } });
  }
};

// ═══ TRADES (FIGCRAFT 02 · JURNAL TRADING EXACT) ═══
const Trades = {
  _trades: [],
  _filterMonth: '',
  _filterResult: 'all', // 'all' | 'Win' | 'Loss'
  _searchQuery: '',
  _months: [
    { v: '', t: 'Semua Bulan' },
    { v: '01', t: 'Januari' }, { v: '02', t: 'Februari' }, { v: '03', t: 'Maret' },
    { v: '04', t: 'April' }, { v: '05', t: 'Mei' }, { v: '06', t: 'Juni' },
    { v: '07', t: 'Juli' }, { v: '08', t: 'Agustus' }, { v: '09', t: 'September' },
    { v: '10', t: 'Oktober' }, { v: '11', t: 'November' }, { v: '12', t: 'Desember' }
  ],

  async render() {
    const el = document.getElementById('page-trades');
    el.innerHTML = `<div class="empty-state"><div class="loader-gold" style="margin:0 auto 14px"></div><p>Memuat...</p></div>`;
    if (!App.state.currentAccountId) {
      el.innerHTML = `<div class="empty-state fade-up"><div class="empty-state-icon"><i class="bi bi-person-slash"></i></div><h3>Belum ada akun</h3></div>`;
      return;
    }
    this._trades = await API.getTrades(App.state.currentAccountId, { month: this._filterMonth });
    this.buildList(el);
  },

  setResultFilter(res) {
    this._filterResult = res;
    this.renderCardsOnly();
  },

  onSearch(query) {
    this._searchQuery = (query || '').toLowerCase().trim();
    this.renderCardsOnly();
  },

  getFilteredTrades() {
    return this._trades.filter(t => {
      // Filter by result tab
      if (this._filterResult === 'Win' && t.Result !== 'Win') return false;
      if (this._filterResult === 'Loss' && t.Result !== 'Loss') return false;

      // Filter by search query
      if (this._searchQuery) {
        const q = this._searchQuery;
        const pair = (t.Pair || t.Instrument || 'XAUUSD').toLowerCase();
        const entry = (t.Entry || '').toLowerCase();
        const note = (t.PsychologyNotes || '').toLowerCase();
        const session = (t.Session || '').toLowerCase();
        const match = pair.includes(q) || entry.includes(q) || note.includes(q) || session.includes(q);
        if (!match) return false;
      }
      return true;
    });
  },

  renderCardsOnly() {
    const container = document.getElementById('journalCardList');
    if (!container) return;
    const acc = App.state.currentAccount;
    const cur = acc ? acc.Currency : 'USD';
    const fmt = v => App.fmt(v, cur);

    // Update active tab buttons
    ['all', 'Win', 'Loss'].forEach(r => {
      const btn = document.getElementById('jtab-' + r);
      if (btn) btn.classList.toggle('active', this._filterResult === r);
    });

    const filtered = this.getFilteredTrades();

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:18px;padding:36px 20px;text-align:center;box-shadow:0 2px 8px rgba(15,23,42,0.03)">
          <div style="font-size:16px;font-weight:800;color:#0F172A;margin-bottom:6px">Belum Ada Catatan Trade</div>
          <div style="font-size:13px;color:#94A3B8;max-width:260px;margin:0 auto 18px">Klik tombol kuning <strong>+</strong> di bawah untuk mencatat trade pertama Anda.</div>
          <button class="gold-btn" style="display:inline-flex;padding:10px 20px;font-size:13px" onclick="Trades.openAddModal()"><i class="bi bi-plus-lg me-2"></i>Tambah Trade</button>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(t => {
      const isWin = t.Result === 'Win';
      const pair = t.Pair || (t.Entry && t.Entry.match(/^[A-Z]{3,6}/) ? t.Entry.match(/^[A-Z]{3,6}/)[0] : 'XAUUSD');
      const isBuy = t.Position ? t.Position === 'BUY' : (t.ProfitLoss >= 0);
      const lot = t.LotSize || t.Lot || (isBuy ? '0.50' : '0.15');
      const strategy = t.Entry || t.Strategy || 'Price Action Strategy';
      const timeDisplay = App.fmtDate(t.Date);
      const rrDisplay = isWin ? 'Win' : (t.ProfitLoss < 0 ? 'Loss' : 'BE');

      return `
        <div class="journal-card" onclick="Trades.openEditModal('${t.TradeID}')">
          <div class="jcard-top">
            <div class="jcard-left-pair">
              <span class="jcard-pair">${pair}</span>
              <span class="jcard-pos-badge ${isBuy ? 'buy' : 'sell'}">${isBuy ? 'BUY' : 'SELL'} ${lot} Lot</span>
            </div>
            <div class="jcard-pl ${isWin ? 't-win' : 't-loss'}">
              ${t.ProfitLoss > 0 ? '+' : ''}${fmt(t.ProfitLoss)}
            </div>
          </div>
          <div class="jcard-mid">
            <span class="jcard-tag">${strategy}</span>
          </div>
          <div class="jcard-bot">
            <div class="jcard-time">${timeDisplay}</div>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="jcard-rr ${isWin ? 't-win' : 't-loss'}">${rrDisplay}</span>
              <button class="icon-micro" style="width:24px;height:24px;border-radius:6px;font-size:10px" onclick="event.stopPropagation(); Trades.openEditModal('${t.TradeID}')"><i class="bi bi-pencil"></i></button>
              <button class="icon-micro" style="width:24px;height:24px;border-radius:6px;font-size:10px" onclick="event.stopPropagation(); Trades.confirmDelete('${t.TradeID}')"><i class="bi bi-trash3"></i></button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  buildList(el) {
    const acc = App.state.currentAccount;
    const cur = acc ? acc.Currency : 'USD';
    const fmt = v => App.fmt(v, cur);
    const selMonthObj = this._months.find(m => m.v === this._filterMonth);
    const currentYear = new Date().getFullYear();
    const selLabel = selMonthObj?.v ? `${selMonthObj.t} ${currentYear}` : `November ${currentYear}`;

    // Calculate Month Performance Stats
    const totalTrades = this._trades.length;
    const wins = this._trades.filter(t => t.Result === 'Win').length;
    const losses = this._trades.filter(t => t.Result === 'Loss').length;
    const netPL = this._trades.reduce((s, t) => s + (parseFloat(t.ProfitLoss) || 0), 0);
    const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : '0.0';

    el.innerHTML = `
      <div class="fade-up" style="padding-bottom: 90px;">
        <!-- Header Row: Title & Month Picker Pill -->
        <div class="journal-header">
          <div class="journal-title">Jurnal Trading</div>
          <div style="display:flex;align-items:center;gap:8px">
            ${acc && acc.metaApiAccountId ? `
              <button class="journal-month-pill" style="color:#B45309;background:rgba(255,215,0,0.15);border:1px solid rgba(255,215,0,0.35);cursor:pointer" onclick="MetaApiSync.quickSyncCurrentAccount()" title="Sync Transaksi MT5">
                <i class="bi bi-arrow-repeat me-1"></i><span>Sync MT5</span>
              </button>
            ` : ''}
            <button class="journal-month-pill" onclick="Trades.openMonthPicker()">
              <span>${selLabel}</span>
              <i class="bi bi-caret-down-fill ms-1" style="font-size:10px;color:#64748B"></i>
            </button>
          </div>
        </div>

        <!-- Search Bar -->
        <div class="journal-search-wrap">
          <i class="bi bi-search journal-search-icon"></i>
          <input type="text" class="journal-search-input" id="journalSearchInput" placeholder="Cari pair, strategi, atau catatan..." value="${this._searchQuery}" oninput="Trades.onSearch(this.value)" />
        </div>

        <!-- Hero Performance Card -->
        <div class="journal-hero-card">
          <div class="journal-hero-top">
            <span class="journal-hero-badge">Performa Bulan</span>
            <span class="journal-hero-trades-count">${totalTrades} Trades Total</span>
          </div>
          <div class="journal-hero-lbl">Total Net P/L Bulan Ini</div>
          <div class="journal-hero-bottom">
            <div class="journal-hero-val">${netPL >= 0 ? '+' : ''}${fmt(netPL)}</div>
            <div class="journal-hero-wr" style="color: ${winRate >= 50 ? '#10B981' : '#EE4444'}">
              <span>${winRate >= 50 ? '▲' : '▼'}</span>
              <span>${winRate}% Win Rate</span>
            </div>
          </div>
        </div>

        <!-- Filter Tabs: Semua, Win, Loss -->
        <div class="journal-tabs-row">
          <button type="button" class="journal-tab-pill ${this._filterResult === 'all' ? 'active' : ''}" id="jtab-all" onclick="Trades.setResultFilter('all')">Semua (${totalTrades})</button>
          <button type="button" class="journal-tab-pill ${this._filterResult === 'Win' ? 'active' : ''}" id="jtab-Win" onclick="Trades.setResultFilter('Win')">Win (${wins})</button>
          <button type="button" class="journal-tab-pill ${this._filterResult === 'Loss' ? 'active' : ''}" id="jtab-Loss" onclick="Trades.setResultFilter('Loss')">Loss (${losses})</button>
        </div>

        <!-- Card List Container -->
        <div id="journalCardList"></div>
      </div>
    `;

    this.renderCardsOnly();
  },

  openMonthPicker() {
    document.getElementById('monthPickerGrid').innerHTML = this._months.map(m => `<button class="month-grid-btn ${this._filterMonth === m.v ? 'active' : ''}" onclick="Trades.selectMonth('${m.v}')">${m.t}</button>`).join('');
    App.openSheet('monthPickerSheet');
  },
  selectMonth(m) { this._filterMonth = m; App.closeSheet('monthPickerSheet'); this.render(); },

  openAddModal() {
    document.getElementById('tradeId').value = '';
    document.getElementById('tradeSheetTitle').innerHTML = '<i class="bi bi-journal-plus me-2"></i>Tambah Trade';
    document.getElementById('tradeForm').reset();
    document.getElementById('tradeDate').value = App.today();
    document.getElementById('tradeAccount').innerHTML = App.state.accounts.map(a => `<option value="${a.AccountID}" ${a.AccountID === App.state.currentAccountId ? 'selected' : ''}>${a.Name} (${a.Currency})</option>`).join('');
    const pairEl = document.getElementById('tradePair'); if (pairEl) pairEl.value = 'XAUUSD';
    const posEl = document.getElementById('tradePosition'); if (posEl) posEl.value = 'BUY';
    const lotEl = document.getElementById('tradeLot'); if (lotEl) lotEl.value = '0.50';
    this.updateMethods(); this.updateCurrencyLabel();
    document.getElementById('tradePreview').textContent = 'Masukkan nilai P/L';
    document.getElementById('tradePreview').className = 'trade-preview';
    App.openSheet('tradeSheet');
  },

  openEditModal(id) {
    const t = this._trades.find(t => t.TradeID === id); if (!t) return;
    document.getElementById('tradeId').value = id;
    document.getElementById('tradeSheetTitle').innerHTML = '<i class="bi bi-pencil me-2"></i>Edit Trade';
    document.getElementById('tradeDate').value = t.Date || App.today();
    document.getElementById('tradeAccount').innerHTML = App.state.accounts.map(a => `<option value="${a.AccountID}" ${a.AccountID === t.AccountID ? 'selected' : ''}>${a.Name} (${a.Currency})</option>`).join('');
    const pairEl = document.getElementById('tradePair'); if (pairEl) pairEl.value = t.Pair || 'XAUUSD';
    const posEl = document.getElementById('tradePosition'); if (posEl) posEl.value = t.Position || (t.ProfitLoss >= 0 ? 'BUY' : 'SELL');
    const lotEl = document.getElementById('tradeLot'); if (lotEl) lotEl.value = t.LotSize || '0.50';
    this.updateMethods();
    document.getElementById('tradeEntry').value = t.Entry || '';
    document.getElementById('tradePL').value = t.ProfitLoss || '';
    document.getElementById('tradePsych').value = t.PsychologyNotes || '';
    this.updateCurrencyLabel(); this.updatePreview(t.ProfitLoss);
    App.openSheet('tradeSheet');
  },

  updateMethods() {
    const m = (App.state.settings.tradingMethods || 'SMC · Liquidity Sweep & FVG,Trendline Fakeout Breakdown,Earnings Gap & Retest Key Level,Order Block Rejection,Scalping,Swing,ICT,Price Action').split(',');
    document.getElementById('tradeEntry').innerHTML = '<option value="">-- Pilih Metode --</option>' + m.map(x => `<option value="${x.trim()}">${x.trim()}</option>`).join('');
  },
  updateCurrencyLabel() { const id = document.getElementById('tradeAccount')?.value; const a = App.state.accounts.find(a => a.AccountID === id); const l = document.getElementById('plSuffix'); if (l) l.textContent = a ? a.Currency : 'IDR'; },
  updatePreview(val) { const v = parseFloat(val), el = document.getElementById('tradePreview'); if (!el) return; if (isNaN(v)) { el.textContent = 'Masukkan nilai P/L'; el.className = 'trade-preview'; return; } el.textContent = `${v > 0 ? 'Win' : v < 0 ? 'Loss' : 'BE'} — ${v > 0 ? '+' : ''}${v}`; el.className = `trade-preview ${v > 0 ? 'win' : v < 0 ? 'loss' : ''}`; },

  async saveTrade() {
    const btn = document.getElementById('saveTradeBtn');
    btn.disabled = true; btn.innerHTML = '<span class="loader-gold" style="display:inline-block;width:18px;height:18px;border-width:2px"></span>';
    const id = document.getElementById('tradeId').value;
    const pl = parseFloat(document.getElementById('tradePL').value);
    if (isNaN(pl)) { App.toast('Masukkan nilai P/L'); btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-lg me-2"></i>Simpan Trade'; return; }
    const data = {
      Date: document.getElementById('tradeDate').value,
      AccountID: document.getElementById('tradeAccount').value,
      Pair: document.getElementById('tradePair')?.value || 'XAUUSD',
      Position: document.getElementById('tradePosition')?.value || 'BUY',
      LotSize: document.getElementById('tradeLot')?.value || '0.50',
      Entry: document.getElementById('tradeEntry').value,
      ProfitLoss: pl,
      PsychologyNotes: document.getElementById('tradePsych').value
    };
    const res = id ? await API.updateTrade(id, data) : await API.addTrade(data);
    if (res.success) {
      App.closeSheet('tradeSheet');
      App.toast(id ? '✅ Trade diperbarui!' : pl > 0 ? '✅ WIN ditambahkan!' : '✅ LOSS ditambahkan!');
      await Promise.all([this.render(), Dashboard.render()]);
    } else {
      App.toast('❌ ' + (res.error || 'Gagal'));
    }
    btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-lg me-2"></i>Simpan Trade';
  },

  confirmDelete(id) { App.confirmDelete(async () => { await API.deleteTrade(id); App.toast('🗑️ Trade dihapus'); await Promise.all([this.render(), Dashboard.render()]); }); }
};

// ═══ CALCULATOR (FIGCRAFT 04 · KALKULATOR EXACT) ═══
const Calculator = {
  _rate: 16250,
  _tab: 'lot',
  _rMode: 'percent', // 'percent' or 'nominal'
  _riskPct: 1.0,
  _riskNominal: 0,
  _riskAmount: 0,
  _bal: 0,
  _sl: 30,
  _pair: 'XAUUSD',
  _rrDir: 'BUY',
  _rrEntry: 2650.0,
  _rrSL: 2640.0,
  _rrTP: 2670.0,

  async fetchRate() {
    const el = document.getElementById('ratePillText'); if (el) el.textContent = 'Memuat...';
    try { const r = await fetch('https://api.exchangerate-api.com/v4/latest/USD'); const d = await r.json(); this._rate = d.rates?.IDR || 16250; }
    catch { try { const r2 = await fetch('https://api.frankfurter.app/latest?from=USD&to=IDR'); const d2 = await r2.json(); this._rate = d2.rates?.IDR || 16250; } catch { this._rate = 16250; } }
    if (el) el.textContent = '$1 = Rp ' + Math.round(this._rate).toLocaleString('id-ID');
    const dEl = document.getElementById('dashRatePillText');
    if (dEl) dEl.textContent = '$1 = Rp ' + Math.round(this._rate).toLocaleString('id-ID');
  },

  setTab(tab) {
    this._tab = tab;
    this.render();
  },

  setRMode(mode) {
    this._rMode = mode;
    this.render();
  },

  setRisk(pct) {
    this._riskPct = pct;
    const inp = document.getElementById('calRisk');
    if (inp) {
      inp.value = pct;
      this.calculate();
    }
    // Update chip active classes
    [0.5, 1.0, 2.0].forEach(p => {
      const c = document.getElementById('chip-' + String(p).replace('.', '_'));
      if (c) c.classList.toggle('active', p === pct);
    });
  },

  setRiskNominal(nom) {
    this._riskNominal = nom;
    const inp = document.getElementById('calRisk');
    if (inp) {
      inp.value = nom;
      this.calculate();
    }
    const acc = App.state.currentAccount;
    const cur = acc ? acc.Currency : 'USD';
    const chips = cur === 'IDR' ? [50000, 100000, 250000] : [500, 1000, 2500];
    chips.forEach(val => {
      const c = document.getElementById('chip-nom-' + val);
      if (c) c.classList.toggle('active', val === nom);
    });
  },

  setRRDir(dir) {
    this._rrDir = dir;
    this.render();
  },

  setRRRisk(amount) {
    this._riskAmount = amount;
    this._riskNominal = amount;
    const inp = document.getElementById('rrRiskNominal');
    if (inp) inp.value = amount;
    this.updateRRSim();
  },

  updateRRSim() {
    const inp = document.getElementById('rrRiskNominal');
    const acc = App.state.currentAccount;
    const cur = acc ? acc.Currency : 'USD';
    const initBal = acc ? (parseFloat(acc.InitialBalance) || (cur === 'IDR' ? 10000000 : 209891)) : (cur === 'IDR' ? 10000000 : 209891);
    const bal = this._bal || initBal;
    const risk = parseFloat(inp?.value) || this._riskAmount || (cur === 'IDR' ? 100000 : 100);
    this._riskAmount = risk;
    this._riskNominal = risk;

    const grid = document.getElementById('calRRGrid');
    if (!grid) return;

    const items = [
      { ratio: '1:1', mul: 1, label: '' },
      { ratio: '1:1.5', mul: 1.5, label: '' },
      { ratio: '1:2', mul: 2, label: '(Standar Minimum)', badge: 'Direkomendasikan' },
      { ratio: '1:2.5', mul: 2.5, label: '' },
      { ratio: '1:3', mul: 3, label: '', badge: 'Optimal' },
      { ratio: '1:4', mul: 4, label: '' },
      { ratio: '1:5', mul: 5, label: '' }
    ];

    grid.innerHTML = items.map(item => {
      const profit = risk * item.mul;
      const pct = bal > 0 ? ((profit / bal) * 100).toFixed(1) : '0.0';
      const isRec = item.mul === 2;
      return `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:${isRec ? '#F8FCF5' : '#F8F9FA'};border:1px solid ${isRec ? '#10B981' : '#E2E8F0'};border-radius:12px;transition:all var(--transition)">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-weight:800;font-size:13px;color:#0F172A">R:R ${item.ratio}</span>
            ${item.label ? `<span style="font-size:11px;color:#64748B;font-weight:600">${item.label}</span>` : ''}
            ${item.badge ? `<span style="background:${item.mul >= 3 ? '#121214' : '#10B981'};color:${item.mul >= 3 ? '#D4FF00' : '#FFFFFF'};font-size:9px;font-weight:800;padding:2px 6px;border-radius:6px;text-transform:uppercase">${item.badge}</span>` : ''}
          </div>
          <div style="text-align:right">
            <span class="t-win" style="font-family:var(--font-num);font-weight:900;font-size:14px;color:#10B981">+ ${App.fmt(profit, cur)}</span>
            <span style="font-size:10px;color:#64748B;margin-left:4px;font-weight:700">(+${pct}%)</span>
          </div>
        </div>
      `;
    }).join('');
  },

  calcPriceRR() {
    const entryEl = document.getElementById('rrEntry');
    const slEl = document.getElementById('rrSL');
    const tpEl = document.getElementById('rrTP');
    if (!entryEl || !slEl || !tpEl) return;

    const entry = parseFloat(entryEl.value) || 0;
    const sl = parseFloat(slEl.value) || 0;
    const tp = parseFloat(tpEl.value) || 0;
    this._rrEntry = entry;
    this._rrSL = sl;
    this._rrTP = tp;

    let slDist = 0;
    let tpDist = 0;

    if (this._rrDir === 'BUY') {
      slDist = Math.abs(entry - sl);
      tpDist = Math.abs(tp - entry);
    } else {
      slDist = Math.abs(sl - entry);
      tpDist = Math.abs(entry - tp);
    }

    const ratio = slDist > 0 ? (tpDist / slDist) : 0;
    const ratioText = ratio > 0 ? `1 : ${ratio.toFixed(2)}` : '1 : —';

    const ratioEl = document.getElementById('rrCalculatedRatio');
    if (ratioEl) ratioEl.textContent = ratioText;

    const badgeEl = document.getElementById('rrRatioBadge');
    if (badgeEl) {
      if (ratio >= 2.0) {
        badgeEl.style.background = 'rgba(16,185,129,0.2)';
        badgeEl.style.color = '#10B981';
        badgeEl.textContent = '✓ Optimal (≥ 1:2)';
      } else if (ratio >= 1.5) {
        badgeEl.style.background = 'rgba(212,255,0,0.2)';
        badgeEl.style.color = '#D4FF00';
        badgeEl.textContent = '✓ Cukup Bagus (≥ 1:1.5)';
      } else {
        badgeEl.style.background = 'rgba(238,68,68,0.2)';
        badgeEl.style.color = '#EE4444';
        badgeEl.textContent = '⚠️ Kurang Ideal (< 1:1.5)';
      }
    }

    const distEl = document.getElementById('rrPipDistances');
    if (distEl) {
      distEl.textContent = `SL: ${slDist.toFixed(1)} pts · TP: ${tpDist.toFixed(1)} pts`;
    }
  },

  render() {
    const el = document.getElementById('page-calculator');
    const acc = App.state.currentAccount;
    const cur = acc ? acc.Currency : 'USD';
    const initBal = acc ? (parseFloat(acc.InitialBalance) || (cur === 'IDR' ? 10000000 : 209891)) : (cur === 'IDR' ? 10000000 : 209891);
    const defaultNominal = cur === 'IDR' ? 100000 : 100;
    if (!this._riskNominal) this._riskNominal = defaultNominal;

    const bal = this._bal || initBal;
    let currentRisk = this._riskAmount;
    if (!currentRisk || currentRisk <= 0) {
      if (this._rMode === 'percent') {
        currentRisk = bal * ((this._riskPct || 1.0) / 100);
      } else {
        currentRisk = this._riskNominal || defaultNominal;
      }
      this._riskAmount = currentRisk;
    }

    const rrChips = cur === 'IDR' ? [50000, 100000, 250000, 500000] : [50, 100, 200, 500];

    el.innerHTML = `<div class="fade-up" style="padding: 10px 2px 90px;">
      <!-- Title & Subtitle -->
      <div class="calc-title">Kalkulator Trading</div>
      <div class="calc-sub">Risk & Lot Size Management</div>

      <!-- Segmented Control (3 Tabs) -->
      <div class="calc-seg-wrap">
        <button class="calc-seg-btn ${this._tab === 'lot' ? 'active' : ''}" onclick="Calculator.setTab('lot')">Hitung Lot</button>
        <button class="calc-seg-btn ${this._tab === 'rr' ? 'active' : ''}" onclick="Calculator.setTab('rr')">Risk / Reward</button>
        <button class="calc-seg-btn ${this._tab === 'kurs' ? 'active' : ''}" onclick="Calculator.setTab('kurs')">Konversi Kurs</button>
      </div>

      ${this._tab === 'lot' ? `
      <!-- Input Card -->
      <div class="calc-input-card">
        <div class="calc-field-group">
          <label class="calc-label">Instrumen / Pair</label>
          <div style="position:relative">
            <select id="calPair" class="calc-field" onchange="Calculator.calculate()">
              <option value="XAUUSD" selected>XAUUSD (Gold vs US Dollar)</option>
              <option value="EURUSD">EURUSD (Euro vs US Dollar)</option>
              <option value="GBPUSD">GBPUSD (Pound vs US Dollar)</option>
              <option value="BTCUSD">BTCUSD (Bitcoin vs US Dollar)</option>
            </select>
          </div>
        </div>

        <div class="form-row-2">
          <div class="calc-field-group">
            <label class="calc-label">Saldo Akun (${cur})</label>
            <input type="number" id="calBalance" class="calc-field" value="${initBal}" placeholder="${cur === 'IDR' ? '10000000' : '209891'}" oninput="Calculator.calculate()"/>
          </div>
          <div class="calc-field-group">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <label class="calc-label" style="margin-bottom:0">Resiko (${this._rMode === 'percent' ? '%' : cur})</label>
              <div class="calc-risk-toggle">
                <button type="button" class="calc-risk-toggle-btn ${this._rMode === 'percent' ? 'active' : ''}" onclick="Calculator.setRMode('percent')">%</button>
                <button type="button" class="calc-risk-toggle-btn ${this._rMode === 'nominal' ? 'active' : ''}" onclick="Calculator.setRMode('nominal')">Nominal</button>
              </div>
            </div>
            <div style="position:relative">
              <input type="number" id="calRisk" class="calc-field" value="${this._rMode === 'percent' ? this._riskPct : this._riskNominal}" step="${this._rMode === 'percent' ? '0.1' : (cur === 'IDR' ? '10000' : '50')}" placeholder="${this._rMode === 'percent' ? '1.0' : defaultNominal}" oninput="Calculator.calculate()"/>
              <span style="position:absolute;right:14px;top:50%;transform:translateY(-50%);font-size:12px;font-weight:700;color:#64748B;pointer-events:none">${this._rMode === 'percent' ? '%' : cur}</span>
            </div>
          </div>
        </div>

        <div class="calc-field-group" style="margin-top:14px">
          <label class="calc-label">Stop Loss (Pips / Points)</label>
          <input type="number" id="calSL" class="calc-field" value="30" placeholder="30" oninput="Calculator.calculate()"/>
        </div>
      </div>

      <!-- Result Card (Ukuran Lot Direkomendasikan) -->
      <div class="calc-result-card" id="calResult">
        <div class="calc-res-label">UKURAN LOT DIREKOMENDASIKAN</div>
        <div class="calc-giant-lot-wrap">
          <span class="calc-giant-val" id="calLotVal">0.70</span>
          <span class="calc-giant-unit">Lot</span>
        </div>
        <div class="calc-stats-3col">
          <div class="calc-stat-c">
            <div class="calc-stat-lbl">Maksimal Resiko</div>
            <div class="calc-stat-val t-loss" id="calRiskUSD" style="color:#EE4444">$2,098.91</div>
          </div>
          <div class="calc-stat-c">
            <div class="calc-stat-lbl">Potensi TP (1:2)</div>
            <div class="calc-stat-val t-win" id="calTPVal" style="color:#10B981">+$4,197.82</div>
          </div>
          <div class="calc-stat-c">
            <div class="calc-stat-lbl">Nilai per Pip</div>
            <div class="calc-stat-val" id="calPipVal" style="color:#FFFFFF">$70.00 / pip</div>
          </div>
        </div>
      </div>

      <!-- Rule Check Card -->
      <div class="calc-rule-card">
        <div class="calc-rule-item" id="calRule1"><i class="bi bi-check2 me-2"></i>Resiko <span id="calRuleRisk">1%</span> masih di bawah batas harian (<span id="calRuleDaily">$3,000</span>)</div>
        <div class="calc-rule-item" id="calRule2"><i class="bi bi-check2 me-2"></i>Target Risk/Reward minimum 1:2 terpenuhi</div>
      </div>
      ` : this._tab === 'rr' ? `
      <!-- Tab 2: Interactive Risk / Reward Simulation -->
      <div class="card" style="background:#FFFFFF;border:1px solid var(--border);border-radius:18px;padding:18px;margin-bottom:16px;box-shadow:0 2px 10px rgba(15,23,42,0.04)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <div>
            <div class="card-title" style="margin-bottom:2px">Simulasi Risk : Reward</div>
            <div style="font-size:12px;color:var(--text3)">Proyeksi profit berdasarkan resiko per trade</div>
          </div>
          <span style="background:rgba(212,255,0,0.18);color:#121214;font-size:11px;font-weight:800;border:1px solid rgba(212,255,0,0.4);border-radius:8px;padding:4px 8px">Live Sync</span>
        </div>

        <div class="calc-field-group" style="margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <label class="calc-label" style="margin-bottom:0">Nominal Resiko (${cur})</label>
            <span style="font-size:11px;color:var(--text3);font-weight:600">Saldo: ${App.fmt(bal, cur)}</span>
          </div>
          <div style="position:relative">
            <input type="number" id="rrRiskNominal" class="calc-field" value="${Math.round(currentRisk)}" oninput="Calculator.updateRRSim()" />
            <span style="position:absolute;right:14px;top:50%;transform:translateY(-50%);font-size:12px;font-weight:700;color:#64748B;pointer-events:none">${cur}</span>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:8px" id="calRRGrid"></div>
      </div>

      <!-- Card 2: Kalkulator Harga Trade (Entry / SL / TP) -->
      <div class="card" style="background:#FFFFFF;border:1px solid var(--border);border-radius:18px;padding:18px;margin-bottom:16px;box-shadow:0 2px 10px rgba(15,23,42,0.04)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div>
            <div class="card-title" style="margin-bottom:2px">Kalkulator Level Harga</div>
            <div style="font-size:12px;color:var(--text3)">Hitung rasio R:R dari Entry, SL & TP</div>
          </div>
          <div class="calc-risk-toggle">
            <button type="button" class="calc-risk-toggle-btn ${this._rrDir === 'BUY' ? 'active' : ''}" style="${this._rrDir === 'BUY' ? 'background:#10B981 !important;color:#FFFFFF !important' : ''}" onclick="Calculator.setRRDir('BUY')">BUY</button>
            <button type="button" class="calc-risk-toggle-btn ${this._rrDir === 'SELL' ? 'active' : ''}" style="${this._rrDir === 'SELL' ? 'background:#EE4444 !important;color:#FFFFFF !important' : ''}" onclick="Calculator.setRRDir('SELL')">SELL</button>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px">
          <div class="calc-field-group">
            <label class="calc-label" style="font-size:10px">Entry Price</label>
            <input type="number" step="any" id="rrEntry" class="calc-field" value="${this._rrEntry}" style="padding:10px 8px;font-size:13px" oninput="Calculator.calcPriceRR()" />
          </div>
          <div class="calc-field-group">
            <label class="calc-label" style="font-size:10px;color:#EE4444">Stop Loss</label>
            <input type="number" step="any" id="rrSL" class="calc-field" value="${this._rrSL}" style="padding:10px 8px;font-size:13px;border-color:rgba(238,68,68,0.3)" oninput="Calculator.calcPriceRR()" />
          </div>
          <div class="calc-field-group">
            <label class="calc-label" style="font-size:10px;color:#10B981">Take Profit</label>
            <input type="number" step="any" id="rrTP" class="calc-field" value="${this._rrTP}" style="padding:10px 8px;font-size:13px;border-color:rgba(16,185,129,0.3)" oninput="Calculator.calcPriceRR()" />
          </div>
        </div>

        <div id="rrPriceResultBox" style="background:#121214;border-radius:14px;padding:14px 16px;color:#FFFFFF;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:10px;color:#94A3B8;text-transform:uppercase;letter-spacing:0.8px;font-weight:700">Rasio Risk : Reward</div>
            <div style="font-family:var(--font-num);font-size:22px;font-weight:900;color:var(--gold)" id="rrCalculatedRatio">1 : 2.0</div>
          </div>
          <div style="text-align:right">
            <div id="rrRatioBadge" style="display:inline-block;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:800;background:rgba(16,185,129,0.2);color:#10B981;margin-bottom:4px">✓ Optimal (≥ 1:2)</div>
            <div style="font-size:11px;color:#94A3B8" id="rrPipDistances">SL: 10.0 pts · TP: 20.0 pts</div>
          </div>
        </div>
      </div>
      ` : `
      <!-- Tab 3: Konversi Kurs Live -->
      <div class="card" style="background:#FFFFFF;border:1px solid var(--border);border-radius:18px;padding:18px;margin-bottom:16px;box-shadow:0 2px 10px rgba(15,23,42,0.04)">
        <div class="card-title">Live Exchange Rate</div>
        <div style="font-size:13px;color:var(--text3);margin-bottom:14px">Nilai tukar mata uang live untuk kalkulasi margin & risiko</div>
        <div style="background:#121214;padding:20px;border-radius:16px;color:#FFFFFF;text-align:center;margin-bottom:14px">
          <div style="font-size:11px;color:#94A3B8;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">USD / IDR RATE</div>
          <div style="font-family:var(--font-num);font-size:32px;font-weight:900;color:var(--gold)">Rp ${Math.round(this._rate).toLocaleString('id-ID')}</div>
        </div>
        <button class="gold-btn w-100" onclick="Calculator.fetchRate()"><i class="bi bi-arrow-repeat me-2"></i>Perbarui Kurs</button>
      </div>
      `}
    </div>`;

    if (this._tab === 'lot') {
      setTimeout(() => this.calculate(), 30);
    } else if (this._tab === 'rr') {
      setTimeout(() => { this.updateRRSim(); this.calcPriceRR(); }, 30);
    }
  },

  calculate() {
    const balEl = document.getElementById('calBalance');
    const riskEl = document.getElementById('calRisk');
    const slEl = document.getElementById('calSL');
    if (!balEl || !riskEl || !slEl) return;

    const acc = App.state.currentAccount;
    const cur = acc ? acc.Currency : 'USD';
    const bal = parseFloat(balEl.value) || (cur === 'IDR' ? 10000000 : 209891);
    const riskVal = parseFloat(riskEl.value) || (this._rMode === 'percent' ? 1.0 : (cur === 'IDR' ? 100000 : 100));
    const sl = parseFloat(slEl.value) || 30;

    let riskAmount = 0;
    let riskPct = 0;

    if (this._rMode === 'percent') {
      riskPct = riskVal;
      this._riskPct = riskPct;
      riskAmount = (bal * (riskPct / 100));
      this._riskNominal = riskAmount;
    } else {
      riskAmount = riskVal;
      this._riskNominal = riskAmount;
      riskPct = bal > 0 ? (riskAmount / bal) * 100 : 1.0;
      this._riskPct = riskPct;
    }

    this._riskAmount = riskAmount;
    this._bal = bal;
    this._sl = sl;

    const rate = this._rate || 16250;
    const riskUSD = cur === 'IDR' ? (riskAmount / rate) : riskAmount;
    
    let lot = Math.max(0.01, Math.floor((riskUSD / (sl * 10)) * 100) / 100);
    const tpUSD = riskAmount * 2;
    const pipVal = lot * 10;

    const lotValEl = document.getElementById('calLotVal');
    if (lotValEl) lotValEl.textContent = lot.toFixed(2);

    const rUSDEl = document.getElementById('calRiskUSD');
    if (rUSDEl) rUSDEl.textContent = cur === 'IDR' ? 'Rp ' + Math.round(riskAmount).toLocaleString('id-ID') : '$' + riskAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const tpValEl = document.getElementById('calTPVal');
    if (tpValEl) tpValEl.textContent = cur === 'IDR' ? '+Rp ' + Math.round(tpUSD).toLocaleString('id-ID') : '+$' + tpUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const pipValEl = document.getElementById('calPipVal');
    if (pipValEl) pipValEl.textContent = (cur === 'IDR' ? 'Rp ' + Math.round(pipVal * rate).toLocaleString('id-ID') : '$' + pipVal.toFixed(2)) + ' / pip';

    const rRiskEl = document.getElementById('calRuleRisk');
    if (rRiskEl) rRiskEl.textContent = riskPct.toFixed(1) + '%';

    const rDailyEl = document.getElementById('calRuleDaily');
    if (rDailyEl) {
      const dailyLimit = acc ? (parseFloat(acc.DailyLossLimit) || (bal * 0.03)) : (bal * 0.03);
      rDailyEl.textContent = cur === 'IDR' ? 'Rp ' + Math.round(dailyLimit).toLocaleString('id-ID') : '$' + Math.round(dailyLimit).toLocaleString('en-US');
    }
  }
};

// ═══ SETTINGS (FIGCRAFT 03 · PENGATURAN EXACT) ═══
const Settings = {
  iconPresets: ['bi-briefcase-fill', 'bi-bank2', 'bi-wallet2', 'bi-cash-coin', 'bi-coin', 'bi-currency-dollar', 'bi-graph-up-arrow', 'bi-bar-chart-line-fill', 'bi-star-fill', 'bi-fire', 'bi-gem', 'bi-award-fill', 'bi-person-circle'],
  _tags: ['SMC', 'ICT', 'Scalping', 'Price Action', 'Swing', 'Breakout'],
  _selectedTag: 'SMC',

  render() {
    const el = document.getElementById('page-settings');
    try {
      App.state.accounts = DB.getAccounts();
      App.state.settings = DB.getSettings();
      if (App.state.settings.tradingMethods) {
        this._tags = App.state.settings.tradingMethods.split(',').map(t => t.trim()).filter(Boolean);
        if (!this._tags.includes(this._selectedTag)) {
          this._selectedTag = this._tags[0] || 'SMC';
        }
      }
      this.build(el, App.state.accounts, App.state.settings);
    } catch (e) {
      el.innerHTML = '<div class="empty-state"><div class="empty-state-icon"><i class="bi bi-exclamation-triangle"></i></div><h3>Error Pengaturan</h3><p style="color:var(--loss);font-size:11px">' + e.message + '</p><button class="ghost-btn" style="margin:16px auto 0;width:auto;padding:10px 20px" onclick="Settings.render()">Coba Lagi</button></div>';
    }
  },

  build(el, accounts, settings) {
    const tagsHtml = this._tags.map(t => `
      <span class="settings-tag-pill ${t === this._selectedTag ? 'active' : ''}" onclick="Settings.selectTag('${t}')">
        ${t}
        <span class="settings-tag-del" onclick="event.stopPropagation(); Settings.removeTag('${t}')" title="Hapus">&times;</span>
      </span>
    `).join('');

    const convVal = settings.conversionRatio || '100000 : 555';
    const rateText = Calculator._rate ? `Rp ${Math.round(Calculator._rate).toLocaleString('id-ID')}` : 'Rp 16.250';
    const displayConv = convVal.includes('(Rp') ? convVal : `${convVal} (${rateText})`;

    const isGoogleLoggedIn = typeof GDriveSync !== 'undefined' && GDriveSync.isLoggedIn();
    const gUser = (typeof GDriveSync !== 'undefined' && GDriveSync.getUser()) || null;

    const currentFontScale = parseInt(localStorage.getItem('ts_font_scale'), 10) || 100;
    let fontScaleLabel = `${currentFontScale}%`;
    if (currentFontScale <= 85) fontScaleLabel = `Kecil (${currentFontScale}%)`;
    else if (currentFontScale === 100) fontScaleLabel = `Normal (${currentFontScale}%)`;
    else if (currentFontScale >= 115) fontScaleLabel = `Besar (${currentFontScale}%)`;

    el.innerHTML = `
      <div class="settings-wrap fade-up">
        <!-- HEADER -->
        <div class="settings-header">
          <div>
            <h1 class="settings-title">Pengaturan</h1>
            <div class="settings-sub">Kelola akun, metode, dan preferensi</div>
          </div>
          <div class="settings-badge-gold">Gold Edition</div>
        </div>

        <!-- GOOGLE CLOUD SYNC CARD -->
        <div class="settings-google-card">
          ${isGoogleLoggedIn && gUser ? `
            <div class="sgc-profile-row">
              ${gUser.picture ? `<img src="${gUser.picture}" class="sgc-avatar" alt="Profile" />` : `<div class="sgc-avatar-placeholder">${(gUser.name || 'G')[0]}</div>`}
              <div class="sgc-info">
                <div class="sgc-name">${gUser.name || 'Pengguna Google'}</div>
                <div class="sgc-email">${gUser.email || ''}</div>
                <div class="sgc-status"><span class="status-dot-circle" style="color:#10B981">●</span> Google Drive AppData Terhubung</div>
              </div>
            </div>
            <div class="sgc-actions-row">
              <button type="button" class="sgc-btn-sync" onclick="GDriveSync.manualSync()">
                <i class="bi bi-arrow-repeat"></i> Sync Sekarang
              </button>
              <button type="button" class="sgc-btn-logout" onclick="GDriveSync.signOut()">
                <i class="bi bi-box-arrow-right"></i> Keluar
              </button>
            </div>
          ` : `
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
              <div style="width:38px;height:38px;border-radius:12px;background:#F8FAFC;border:1px solid #E2E8F0;display:flex;align-items:center;justify-content:center;font-size:18px">
                ☁️
              </div>
              <div style="flex:1">
                <div style="font-size:13px;font-weight:700;color:#0F172A">Sinkronisasi Google Drive</div>
                <div style="font-size:10px;color:#64748B">Simpan otomatis data trading Anda ke akun Google pribadi</div>
              </div>
            </div>
            <button type="button" class="google-signin-btn" style="height:40px;font-size:11px" onclick="GDriveSync.signIn()">
              <svg class="google-icon-svg" style="width:16px;height:16px" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>Hubungkan Akun Google</span>
            </button>
          `}
        </div>

        <!-- KONEKSI METATRADER 5 (METAAPI) -->
        <div class="settings-card" style="margin-bottom:20px">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div style="flex:1">
              <div class="settings-card-title" style="margin-bottom:2px"><i class="bi bi-cpu-fill me-2" style="color:#0284C7"></i>Koneksi MetaTrader 5</div>
              <div class="settings-card-desc" style="margin-bottom:0">
                ${isGoogleLoggedIn 
                  ? 'Otomasi penarikan riwayat trading & saldo langsung dari MT5 via MetaApi Cloud.' 
                  : 'Login akun Google diperlukan sebelum dapat menghubungkan akun MT5.'}
              </div>
            </div>
            ${isGoogleLoggedIn 
              ? `<span class="mt5-badge" style="white-space:nowrap;margin-left:10px"><i class="bi bi-shield-check"></i> Cloud Ready</span>` 
              : `<span class="mt5-badge" style="white-space:nowrap;margin-left:10px;background:rgba(239,68,68,0.1);color:#EF4444;border-color:rgba(239,68,68,0.25)"><i class="bi bi-lock-fill"></i> Butuh Login Google</span>`}
          </div>
        </div>

        <!-- DAFTAR AKUN TRADING -->
        <div class="settings-sec-head">
          <span class="settings-sec-title">Daftar Akun Trading</span>
          <span class="settings-sec-meta">${accounts.length} Akun Aktif</span>
        </div>

        <div class="settings-acc-list">
          ${accounts.length ? accounts.map((a, idx) => this.accCard(a, idx)).join('') : `
            <div class="empty-state" style="padding:24px;background:#fff;border-radius:20px;border:1px solid #E2E8F0;margin-bottom:12px">
              <div class="empty-state-icon" style="font-size:32px"><i class="bi bi-wallet2"></i></div>
              <p style="font-size:12px;color:#64748B;margin:6px 0 0">Belum ada akun trading</p>
            </div>
          `}
        </div>

        <button class="settings-add-acc-btn" onclick="Settings.openAddAccount()">
          + Tambah Akun Baru
        </button>

        <!-- METODE & STRATEGI TRADING -->
        <div class="settings-card">
          <div class="settings-card-title">Metode & Strategi Trading</div>
          <div class="settings-card-desc">Kategori setup untuk jurnal & evaluasi emosi</div>
          <div class="settings-tags-list" id="settingsTagsList">
            ${tagsHtml}
            <button class="settings-tag-add-btn" type="button" onclick="Settings.focusNewMethodInput()">+ Tambah</button>
          </div>
          <div class="settings-add-tag-row" style="display:flex;gap:8px;margin-top:10px">
            <input type="text" id="newMethodInput" class="settings-conv-input" style="flex:1" placeholder="Tulis nama metode baru (cth: Supply & Demand)..." onkeydown="if(event.key==='Enter'){event.preventDefault();Settings.addMethodFromInput();}" />
            <button type="button" class="settings-conv-btn" onclick="Settings.addMethodFromInput()" style="white-space:nowrap">
              <i class="bi bi-plus-circle-fill me-1"></i> Tambah
            </button>
          </div>
        </div>

        <!-- UKURAN TAMPILAN FONT -->
        <div class="settings-card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
            <div class="settings-card-title" style="margin-bottom:0">
              <i class="bi bi-fonts me-2" style="color:#0F172A"></i>Ukuran Tampilan Font
            </div>
            <span class="settings-font-badge" id="fontSizeLabel">${fontScaleLabel}</span>
          </div>
          <div class="settings-card-desc">Atur ukuran teks dan tampilan aplikasi agar nyaman di mata.</div>
          <div class="font-slider-wrap">
            <span class="font-slider-icon-sm">A</span>
            <input type="range" id="fontScaleSlider" class="font-scale-slider" min="85" max="120" step="5" value="${currentFontScale}" oninput="Settings.onFontScaleChange(this.value)" />
            <span class="font-slider-icon-lg">A</span>
          </div>
          <div class="font-scale-labels">
            <span>Kecil (85%)</span>
            <span>Normal (100%)</span>
            <span>Besar (120%)</span>
          </div>
        </div>

        <!-- KONVERSI CENT -> IDR (KURS) -->
        <div class="settings-card">
          <div class="settings-card-title">Konversi Cent → IDR (Kurs)</div>
          <div class="settings-card-desc">Format rasio konversi saldo Cent ke Rupiah</div>
          <div class="settings-conv-row">
            <input type="text" id="convRatioInput" class="settings-conv-input" value="${displayConv}" placeholder="100000 : 555 (Rp 16.250)" />
            <button class="settings-conv-btn" onclick="Settings.saveConv()">Update Kurs</button>
          </div>
          <div class="settings-api-status">
            <span class="status-dot-green">●</span> Live API Sync: ExchangeRate-API terhubung
          </div>
        </div>

        <!-- FOOTER -->
        <div class="settings-footer">
          <div class="sf-brand">Trading Suite v2.0 · Gold Edition</div>
          <div class="sf-copy">© by PimenFx</div>
          <div class="sf-warn">⚠️ Trading emas mengandung risiko tinggi</div>
        </div>
      </div>
    `;
  },

  selectTag(tag) {
    this._selectedTag = tag;
    this.render();
  },

  async removeTag(tag) {
    this._tags = this._tags.filter(t => t !== tag);
    if (this._selectedTag === tag) this._selectedTag = this._tags[0] || '';
    await this.saveMethods(false);
    this.render();
    App.toast('🗑️ Metode dihapus');
  },

  focusNewMethodInput() {
    const input = document.getElementById('newMethodInput');
    if (input) {
      input.focus();
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      this.showAddTagPrompt();
    }
  },

  showAddTagPrompt() {
    const val = prompt('Masukkan nama metode / strategi trading baru:');
    if (val) this.addMethod(val);
  },

  async addMethodFromInput() {
    const input = document.getElementById('newMethodInput');
    if (!input) return;
    const val = input.value;
    if (!val || !val.trim()) {
      App.toast('Ketik nama metode terlebih dahulu');
      input.focus();
      return;
    }
    await this.addMethod(val);
    const refreshedInput = document.getElementById('newMethodInput');
    if (refreshedInput) refreshedInput.value = '';
  },

  async addMethod(name) {
    const clean = (name || '').trim();
    if (!clean) return;
    const exists = this._tags.some(t => t.toLowerCase() === clean.toLowerCase());
    if (exists) {
      App.toast('⚠️ Metode "' + clean + '" sudah ada!');
      return;
    }
    this._tags.push(clean);
    this._selectedTag = clean;
    await this.saveMethods(false);
    this.render();
    App.toast('✅ Metode "' + clean + '" ditambahkan!');
  },

  accCard(a, idx) {
    const ic = (a.Icon && typeof a.Icon === 'string') ? a.Icon.trim() : (idx === 0 ? 'bi-briefcase-fill' : 'bi-bank2');
    const isDarkIcon = idx === 0 || ic.includes('briefcase') || ic === '💼';
    const isBlueIcon = !isDarkIcon && (idx === 1 || ic.includes('bank') || ic === '🏛');
    const iconClass = isDarkIcon ? 'dark' : (isBlueIcon ? 'blue' : 'dark');

    let iconInner = '';
    if (ic.startsWith('data:') || ic.startsWith('http')) {
      iconInner = `<img src="${ic}" style="width:28px;height:28px;border-radius:8px;object-fit:cover"/>`;
    } else if (ic === '💼' || ic === '🏛') {
      iconInner = ic;
    } else if (ic.includes('briefcase')) {
      iconInner = '💼';
    } else if (ic.includes('bank')) {
      iconInner = '🏛';
    } else {
      iconInner = `<i class="bi ${ic}"></i>`;
    }

    const cur = a.Currency || 'USD';
    const fmt = v => App.fmt(v, cur);

    // Target string
    let targetStr = '';
    if (a.DailyTargetPct > 0 && a.DailyTarget > 0) {
      targetStr = `${fmt(a.DailyTarget)}/hari (${a.DailyTargetPct}%)`;
    } else if (a.DailyTargetPct > 0) {
      const estTarget = (a.InitialBalance || 0) * (a.DailyTargetPct / 100);
      targetStr = `${fmt(estTarget)}/hari (${a.DailyTargetPct}%)`;
    } else if (a.DailyTarget > 0) {
      targetStr = `${fmt(a.DailyTarget)}`;
    } else {
      targetStr = `${fmt((a.InitialBalance || 0) * 0.05 || (cur === 'USD' ? 500 : 500000))}/hari (5%)`;
    }

    // Status display & color
    const isEvaluasi = (a.Status || '').toLowerCase().includes('evaluasi') || (a.Name || '').toLowerCase().includes('prop') || (a.Name || '').toLowerCase().includes('challenge');
    const isLive = !isEvaluasi && (a.Status === 'Active' || a.Status === 'Live' || !a.Status);
    const statusLabel = isEvaluasi ? 'Evaluasi' : (isLive ? 'Live' : (a.Status || 'Live'));
    const statusClass = isEvaluasi ? 'blue' : (isLive ? 'green' : 'gray');

    // Saldo & loss limit
    const balStr = fmt(a.InitialBalance || (cur === 'USD' ? (idx === 0 ? 209891 : 100000) : 10000000));
    const lossLimitVal = a.DailyLossLimit || (a.InitialBalance ? a.InitialBalance * 0.03 : (cur === 'USD' ? 300 : 300000));
    const lossLimitStr = isEvaluasi ? `Max DD: ${fmt(lossLimitVal)}` : `Loss Limit: ${fmt(lossLimitVal)}`;

    const isMT5 = !!(a.metaApiAccountId || a.isMetaApi);
    const mt5Badge = isMT5 ? '<span class="mt5-badge"><i class="bi bi-cpu-fill"></i> MT5</span>' : '';
    const mt5Sub = isMT5 ? `<div style="color:#0284C7;font-size:10px;margin-top:2px"><i class="bi bi-link-45deg"></i> MT5: ${a.metaApiServer || 'Cloud'} · Login: ${a.metaApiLogin || '-'}</div>` : '';

    return `
      <div class="settings-acc-card">
        <div class="settings-acc-icon ${iconClass}">
          ${iconInner}
        </div>
        <div class="settings-acc-info">
          <div class="settings-acc-name">${a.Name} (${cur}) ${mt5Badge}</div>
          <div class="settings-acc-status ${statusClass}">
            <span class="status-dot-circle">●</span> ${statusLabel} · Target: ${targetStr}
          </div>
          <div class="settings-acc-sub">
            Saldo: ${balStr} | ${lossLimitStr}
            ${mt5Sub}
          </div>
        </div>
        <div class="settings-acc-actions">
          ${isMT5 ? `
            <button class="settings-action-btn sync" onclick="Settings.syncMT5Account('${a.AccountID}')" title="Sync Transaksi MT5">
              <i class="bi bi-arrow-repeat"></i>
            </button>
          ` : ''}
          <button class="settings-action-btn edit" onclick="Settings.openEditAccount('${a.AccountID}')" title="Edit">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="settings-action-btn del" onclick="Settings.deleteAcc('${a.AccountID}')" title="Hapus">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
    `;
  },

  openAddAccount() {
    document.getElementById('accountId').value = '';
    document.getElementById('accSheetTitle').innerHTML = '<i class="bi bi-person-plus me-2"></i>Tambah Akun';
    document.getElementById('accountForm').reset();
    const mt5f = document.getElementById('accountMT5Form');
    if (mt5f) mt5f.reset();
    const toggle = document.getElementById('accountTypeToggle');
    if (toggle) toggle.style.display = 'flex';
    this.switchAccType('manual');
    document.getElementById('accountIcon').value = 'bi-briefcase-fill';
    document.getElementById('accIconPreviewBox').innerHTML = '<i class="bi bi-briefcase-fill"></i>';
    this.renderPresets('');
    document.getElementById('saveAccountBtn').onclick = () => this.saveAccount();
    App.openSheet('accountSheet');
  },

  openEditAccount(id) {
    const a = App.state.accounts.find(a => a.AccountID === id);
    if (!a) return;
    document.getElementById('accountId').value = id;
    document.getElementById('accSheetTitle').innerHTML = '<i class="bi bi-pencil me-2"></i>Edit Akun';
    const toggle = document.getElementById('accountTypeToggle');
    if (toggle) toggle.style.display = 'none';
    this.switchAccType('manual');
    document.getElementById('accountName').value = a.Name;
    document.getElementById('accountCurrency').value = a.Currency || 'USD';
    document.getElementById('accountStatus').value = a.Status || 'Active';
    document.getElementById('accountTarget').value = a.DailyTarget || '';
    document.getElementById('accountTargetPct').value = a.DailyTargetPct || 0;
    document.getElementById('accountLossLimit').value = a.DailyLossLimit || '';
    document.getElementById('accountBalance').value = a.InitialBalance || '';
    const iv = (a.Icon && typeof a.Icon === 'string') ? a.Icon.trim() : 'bi-briefcase-fill';
    document.getElementById('accountIcon').value = iv;
    this.updatePreview(iv);
    this.renderPresets(iv);
    document.getElementById('saveAccountBtn').onclick = () => this.saveAccount();
    App.openSheet('accountSheet');
  },

  switchAccType(type) {
    const manualBtn = document.getElementById('accTypeManualBtn');
    const mt5Btn = document.getElementById('accTypeMT5Btn');
    const manualForm = document.getElementById('accountForm');
    const mt5Form = document.getElementById('accountMT5Form');

    if (type === 'mt5') {
      manualBtn?.classList.remove('active');
      mt5Btn?.classList.add('active');
      if (manualForm) manualForm.style.display = 'none';
      if (mt5Form) {
        mt5Form.style.display = 'block';
        this.renderMT5FormState();
      }
    } else {
      mt5Btn?.classList.remove('active');
      manualBtn?.classList.add('active');
      if (mt5Form) mt5Form.style.display = 'none';
      if (manualForm) manualForm.style.display = 'block';
    }
  },

  renderMT5FormState() {
    const isGoogle = typeof GDriveSync !== 'undefined' && GDriveSync.isLoggedIn();
    const lockBox = document.getElementById('mt5GoogleLockBox');
    const fieldsBox = document.getElementById('mt5FieldsBox');
    if (lockBox && fieldsBox) {
      if (isGoogle) {
        lockBox.style.display = 'none';
        fieldsBox.style.display = 'block';
      } else {
        lockBox.style.display = 'block';
        fieldsBox.style.display = 'none';
      }
    }
  },

  renderPresets(cur) {
    document.getElementById('iconPresets').innerHTML = this.iconPresets.map(ic => `<button type="button" class="icon-preset-btn ${cur === ic ? 'active' : ''}" onclick="Settings.setPreset('${ic}')"><i class="bi ${ic}"></i></button>`).join('');
  },
  setPreset(ic) {
    document.getElementById('accountIconFile').value = '';
    document.getElementById('accountIcon').value = ic;
    this.updatePreview(ic);
    this.renderPresets(ic);
  },
  updatePreview(s) {
    const p = document.getElementById('accIconPreviewBox');
    if (!s || !s.trim()) { p.innerHTML = '<i class="bi bi-briefcase-fill"></i>'; return; }
    if (s.startsWith('data:') || s.startsWith('http')) p.innerHTML = `<img src="${s}" style="width:38px;height:38px;border-radius:9px;object-fit:cover"/>`;
    else p.innerHTML = `<i class="bi ${s.trim()}" style="font-size:22px"></i>`;
  },
  handleIconUpload(e) {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
      document.getElementById('accountIcon').value = ev.target.result;
      this.updatePreview(ev.target.result);
    };
    r.readAsDataURL(f);
  },

  async saveAccount() {
    const btn = document.getElementById('saveAccountBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="loader-gold" style="width:18px;height:18px;border-width:2px"></span>';
    const id = document.getElementById('accountId').value;
    const data = {
      Name: document.getElementById('accountName').value,
      Currency: document.getElementById('accountCurrency').value,
      Status: document.getElementById('accountStatus').value,
      DailyTarget: parseFloat(document.getElementById('accountTarget').value) || 0,
      DailyTargetPct: parseFloat(document.getElementById('accountTargetPct').value) || 0,
      DailyLossLimit: parseFloat(document.getElementById('accountLossLimit').value) || 0,
      InitialBalance: parseFloat(document.getElementById('accountBalance').value) || 0,
      Icon: document.getElementById('accountIcon').value || 'bi-briefcase-fill'
    };
    if (!data.Name) {
      App.toast('Nama akun wajib diisi');
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-check-lg me-2"></i>Simpan Akun';
      return;
    }
    const res = id ? await API.updateAccount(id, data) : await API.addAccount(data);
    if (res.success) {
      App.toast(id ? '✅ Akun diperbarui!' : '✅ Akun ditambahkan!');
      App.closeSheet('accountSheet');
      App.state.accounts = DB.getAccounts();
      if (!App.state.currentAccountId && App.state.accounts.length > 0) {
        App.setAccount(App.state.accounts[0].AccountID);
      }
      await this.render();
    } else {
      App.toast('❌ ' + (res.error || 'Gagal'));
    }
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-check-lg me-2"></i>Simpan Akun';
  },

  deleteAcc(id) {
    App.confirmDelete(async () => {
      await API.deleteAccount(id);
      App.state.accounts = DB.getAccounts();
      if (App.state.currentAccountId === id) {
        App.state.currentAccountId = null;
        App.state.currentAccount = null;
        document.getElementById('topbarSub').textContent = 'Pilih Akun';
      }
      App.toast('🗑️ Akun dihapus');
      await this.render();
    });
  },

  async saveMethods(showToast = true) {
    const str = this._tags.join(',');
    await API.updateSettings({ tradingMethods: str });
    App.state.settings = DB.getSettings();
    if (showToast) App.toast('✅ Metode disimpan!');
  },

  async saveConv() {
    const raw = (document.getElementById('convRatioInput')?.value || '').trim();
    await API.updateSettings({ conversionRatio: raw });
    App.state.settings = DB.getSettings();
    await Calculator.fetchRate();
    App.toast('✅ Kurs berhasil diperbarui!');
    this.render();
  },

  promptChangeToken() {
    if (typeof MetaApiSync === 'undefined') return;
    const cur = MetaApiSync.getToken();
    const res = prompt('Masukkan Access Token MetaApi Anda:', cur);
    if (res !== null && res.trim()) {
      MetaApiSync.setToken(res.trim());
      App.toast('✅ Token MetaApi disimpan!');
      this.render();
    }
  },

  async connectMT5Account() {
    if (typeof GDriveSync !== 'undefined' && !GDriveSync.isLoggedIn()) {
      App.toast('🔒 Anda harus login akun Google terlebih dahulu untuk menghubungkan MT5');
      GDriveSync.signIn();
      return;
    }

    const name = (document.getElementById('mt5AccName')?.value || '').trim();
    const server = (document.getElementById('mt5AccServer')?.value || '').trim();
    const login = (document.getElementById('mt5AccLogin')?.value || '').trim();
    const password = (document.getElementById('mt5AccPassword')?.value || '');

    if (!server) return App.toast('Masukkan Server Broker MT5 (contoh: Exness-MT5Real9)');
    if (!login) return App.toast('Masukkan Login / Nomor Akun MT5');
    if (!password) return App.toast('Masukkan Password Investor MT5');

    const btn = document.getElementById('connectMT5Btn');
    const progressBox = document.getElementById('mt5ProgressBox');
    const progressText = document.getElementById('mt5ProgressText');

    btn.disabled = true;
    if (progressBox) {
      progressBox.style.display = 'block';
      progressBox.style.background = 'rgba(255,215,0,0.08)';
      progressBox.style.borderColor = 'rgba(255,215,0,0.25)';
      progressBox.innerHTML = `
        <span class="loader-gold" style="width:18px;height:18px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:8px"></span>
        <span id="mt5ProgressText" style="font-size:13px;color:#F0F0FF;vertical-align:middle">Menghubungkan akun ke MetaApi Cloud...</span>
      `;
    }

    const updateProgress = (msg) => {
      const pText = document.getElementById('mt5ProgressText');
      if (pText) pText.textContent = msg;
    };

    try {
      updateProgress('Menghubungkan akun ke MetaApi Cloud...');
      const connResult = await MetaApiSync.connectAccount({
        name: name || `MT5-${login}`,
        login,
        password,
        server,
        progressCallback: updateProgress
      });

      updateProgress('Menyimpan akun MT5...');
      const cleanServerName = server.split('-')[0] || server.split('.')[0] || 'MT5';
      const newAcc = {
        AccountID: DB.uid(),
        Name: name || `${cleanServerName} #${login}`,
        Currency: connResult.currency || 'USD',
        Status: 'Active',
        DailyTarget: 0,
        DailyTargetPct: 5,
        DailyLossLimit: (connResult.balance || 0) * 0.03,
        InitialBalance: connResult.balance || 0,
        Balance: connResult.balance || 0,
        Equity: connResult.equity || connResult.balance || 0,
        Icon: 'bi-cpu-fill',
        isMetaApi: true,
        metaApiAccountId: connResult.metaApiAccountId,
        metaApiServer: server,
        metaApiLogin: login,
        lastSync: new Date().toISOString()
      };

      const accs = DB.getAccounts();
      accs.push(newAcc);
      DB.savAccounts(accs);
      App.state.accounts = accs;
      App.state.currentAccountId = newAcc.AccountID;
      App.state.currentAccount = newAcc;

      // Tarik transaksi awal
      updateProgress('Mengunduh riwayat transaksi MT5...');
      const syncRes = await MetaApiSync.syncAccount(newAcc, updateProgress);

      App.closeSheet('accountSheet');
      App.toast(`✅ Akun MT5 terhubung! ${syncRes.newTradesCount} transaksi disinkronkan.`, 4000);

      await Promise.all([
        Settings.render(),
        Dashboard.render(),
        Trades.render()
      ]);
    } catch (err) {
      console.error('Connect MT5 Error:', err);
      const errMsg = err.message || 'Periksa server broker, login, atau password';
      App.toast('❌ ' + errMsg, 6000);
      if (progressBox) {
        progressBox.style.display = 'block';
        progressBox.style.background = 'rgba(239,68,68,0.12)';
        progressBox.style.borderColor = 'rgba(239,68,68,0.3)';
        progressBox.innerHTML = `
          <div style="color:#EF4444;font-size:13px;line-height:1.5;text-align:left">
            <strong><i class="bi bi-exclamation-triangle-fill me-1"></i> Gagal Menghubungkan MT5:</strong><br>
            ${errMsg}
          </div>
        `;
      }
    } finally {
      btn.disabled = false;
    }
  },

  async syncMT5Account(accId) {
    const a = App.state.accounts.find(x => x.AccountID === accId);
    if (!a || !a.metaApiAccountId) {
      return App.toast('Akun ini belum memiliki koneksi MT5.');
    }

    const overlay = document.getElementById('syncStatusOverlay');
    const msg = document.getElementById('syncStatusMsg');
    if (overlay) overlay.style.display = 'flex';
    if (msg) msg.textContent = 'Menyinkronkan transaksi dengan broker MT5...';

    try {
      const res = await MetaApiSync.syncAccount(a, (txt) => {
        if (msg) msg.textContent = txt;
      });
      App.toast(`✅ MT5 Synced! +${res.newTradesCount} transaksi baru.`);
      await Promise.all([
        Settings.render(),
        Dashboard.render(),
        Trades.render()
      ]);
    } catch (e) {
      console.error(e);
      App.toast('❌ Gagal sinkronisasi MT5: ' + e.message);
    } finally {
      if (overlay) overlay.style.display = 'none';
    }
  },

  onFontScaleChange(val) {
    const scale = parseInt(val, 10) || 100;
    this.applyFontScale(scale);
  },

  applyFontScale(scale) {
    const s = parseInt(scale, 10) || 100;
    localStorage.setItem('ts_font_scale', s);

    // Apply zoom scaling to document.body
    const ratio = s / 100;
    if (document.body) {
      document.body.style.zoom = ratio;
    }

    // Update label in Settings UI
    const lbl = document.getElementById('fontSizeLabel');
    if (lbl) {
      let t = `${s}%`;
      if (s <= 85) t = `Kecil (${s}%)`;
      else if (s === 100) t = `Normal (${s}%)`;
      else if (s >= 115) t = `Besar (${s}%)`;
      lbl.textContent = t;
    }
  }
};

window.addEventListener('DOMContentLoaded', () => App.init());
