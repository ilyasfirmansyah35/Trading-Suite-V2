// ═════════════════════════════════════════════════════════════════════════════
// METAAPI MT5 INVESTOR CLOUD SYNC
// ═════════════════════════════════════════════════════════════════════════════

const MetaApiSync = {
  // Pre-configured Token (can be overridden via localStorage)
  DEFAULT_TOKEN: 'eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2M2ExNWY5MGEwYzI1MTYzMThiYThiZjgzMWFjYmQzYSIsImFjY2Vzc1J1bGVzIjpbeyJpZCI6InRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaSIsIm1ldGhvZHMiOlsidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6JFVTRVJfSUQkOioiXX0seyJpZCI6Im1ldGFhcGktcmVzdC1hcGkiLCJtZXRob2RzIjpbIm1ldGFhcGktYXBpOnJlc3Q6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6JFVTRVJfSUQkOioiXX0seyJpZCI6Im1ldGFhcGktcnBjLWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6d3M6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6JFVTRVJfSUQkOioiXX0seyJpZCI6Im1ldGFhcGktcmVhbC10aW1lLXN0cmVhbWluZy1hcGkiLCJtZXRob2RzIjpbIm1ldGFhcGktYXBpOndzOnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqIl19LHsiaWQiOiJtZXRhc3RhdHMtYXBpIiwibWV0aG9kcyI6WyJtZXRhc3RhdHMtYXBpOnJlc3Q6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6JFVTRVJfSUQkOioiXX0seyJpZCI6InJpc2stbWFuYWdlbWVudC1hcGkiLCJtZXRob2RzIjpbInJpc2stbWFuYWdlbWVudC1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoiY29weWZhY3RvcnktYXBpIiwibWV0aG9kcyI6WyJjb3B5ZmFjdG9yeS1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibXQtbWFuYWdlci1hcGkiLCJtZXRob2RzIjpbIm10LW1hbmFnZXItYXBpOnJlc3Q6ZGVhbGluZzoqOioiLCJtdC1tYW5hZ2VyLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqIl19LHsiaWQiOiJiaWxsaW5nLWFwaSIsIm1ldGhvZHMiOlsiYmlsbGluZy1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfV0sImlnbm9yZVJhdGVMaW1pdHMiOmZhbHNlLCJ0b2tlbklkIjoiMjAyMTAyMTMiLCJpbXBlcnNvbmF0ZWQiOmZhbHNlLCJyZWFsVXNlcklkIjoiNjNhMTVmOTBhMGMyNTE2MzE4YmE4YmY4MzFhY2JkM2EiLCJpYXQiOjE3OTUzMTcwMzl9.ZgPI_nck_DKZKwpAQFTu0YRc0jnEEYc9WAc-mWRu6cCqfceprYUU2hStbIMo7VBSTBi-PfDPK7TajghLWBNg6S5sA3Xp5ui7ff9pC98bQWIYaBthavE7Ujr-njaxWer4dS23Mps0jsNRXrVth1bbfTEj835wBe5ubtwlNZ5Wk8ZoM2RXxqmjvcchAI6H2jb9dP42hMZOTZ2UAE9e-0_AY2kwaFsJrbZI03GSjQuGG1gE56btQBfGsWeCo0dEwLWdgOUTDh80kWYO63rgYUqqcCV8hD1YJ9V7ZZgNBfXuAqmNIYLOTv-67KGHwSiJ3GKzvD_lrmLft8Uw61jtTt3ciGFN8hr0bGkoAgXv1SxVRA0FOJEnDArWy_PIoqn3rA_Jj6D1iHBbBY2lF43ImSc4F0FhPlEZKQxMbrRcVcPRDx7eFfCgymD5ygoaO5G8Hk6Xi7QwS2kr_QhdWHW2A1lnKKXw0LY5tzuyXt9cp9VspyfREMl1xRvipEd_0b--4VY3k_836bO16W9v40qnawyr_qk1oWDCjCkFAiKfIAvLj_aaTmNnx4yf8a6Lqh17Wn4Eu5T6Z72Q4DvWoRpxJI_54dGxJ3prYrrPNEAoBwmosrtPtwQLFQl58cx9YQzSRa_byjgK6wRIuShTLQDJuRJZQPg39WLdmX16LWlOFnyqQA8',
  
  PROVISIONING_API: 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai',
  CLIENT_API: 'https://mt-client-api-v1.agiliumtrade.agiliumtrade.ai',

  getToken() {
    return localStorage.getItem('ts_metaapi_token') || this.DEFAULT_TOKEN;
  },

  setToken(token) {
    if (token && token.trim()) {
      localStorage.setItem('ts_metaapi_token', token.trim());
    } else {
      localStorage.removeItem('ts_metaapi_token');
    }
  },

  async request(url, options = {}) {
    const token = this.getToken();
    const headers = {
      'auth-token': token,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      let errText = '';
      try {
        const errJson = await res.json();
        errText = errJson.message || errJson.error || JSON.stringify(errJson);
      } catch {
        errText = await res.text();
      }
      throw new Error(`MetaApi Error (${res.status}): ${errText}`);
    }

    if (res.status === 204) return null;
    return await res.json();
  },

  // 1. Dapatkan daftar akun yang sudah terdaftar di MetaApi
  async getAccounts() {
    return await this.request(`${this.PROVISIONING_API}/users/current/accounts`);
  },

  // 2. Tambah dan deploy akun MT5 di MetaApi
  async connectAccount({ name, login, password, server, progressCallback }) {
    if (progressCallback) progressCallback('Mengecek akun di MetaApi...');
    
    const existingAccounts = await this.getAccounts();
    const cleanLogin = String(login).trim();
    const cleanServer = String(server).trim();

    let account = existingAccounts.find(a => 
      String(a.login).trim() === cleanLogin && 
      a.server.toLowerCase() === cleanServer.toLowerCase()
    );

    if (!account) {
      if (progressCallback) progressCallback('Mendaftarkan akun MT5 ke MetaApi...');
      account = await this.request(`${this.PROVISIONING_API}/users/current/accounts`, {
        method: 'POST',
        body: JSON.stringify({
          name: name || `MT5-${cleanLogin}`,
          type: 'cloud',
          login: cleanLogin,
          password: password.trim(),
          server: cleanServer,
          platform: 'mt5',
          magic: 0
        })
      });
    }

    const accountId = account.id;

    // Pastikan account di-deploy
    if (account.state !== 'DEPLOYED') {
      if (progressCallback) progressCallback('Mengaktifkan (Deploy) server MetaApi...');
      try {
        await this.request(`${this.PROVISIONING_API}/users/current/accounts/${accountId}/deploy`, {
          method: 'POST'
        });
      } catch (err) {
        console.warn('Deploy call note:', err);
      }
    }

    // Tunggu status koneksi terhubung ke broker MT5
    if (progressCallback) progressCallback('Menghubungkan ke broker MT5...');
    let connected = false;
    let attempts = 0;
    const maxAttempts = 30; // 30 x 2s = 60 detik max

    while (!connected && attempts < maxAttempts) {
      attempts++;
      await new Promise(r => setTimeout(r, 2000));
      try {
        const accInfo = await this.request(`${this.PROVISIONING_API}/users/current/accounts/${accountId}`);
        if (accInfo.connectionStatus === 'CONNECTED') {
          connected = true;
          break;
        } else if (accInfo.connectionStatus === 'DISCONNECTED' && attempts > 10) {
          // Bila kredensial broker salah atau broker menolak
          if (accInfo.state === 'DEPLOYED' && attempts > 15) {
            // Bisa jadi sedang reconnecting, kita lanjutkan sedikit lagi
          }
        }
        if (progressCallback) {
          progressCallback(`Menghubungkan ke broker (${accInfo.connectionStatus || accInfo.state})... ${attempts * 2}s`);
        }
      } catch (e) {
        console.warn('Waiting for connection:', e);
      }
    }

    // Ambil info akun (Balance, Currency, Equity)
    if (progressCallback) progressCallback('Mengambil saldo & info akun...');
    let clientInfo = null;
    try {
      clientInfo = await this.request(`${this.CLIENT_API}/users/current/accounts/${accountId}/account-information`);
    } catch (err) {
      console.warn('Could not immediately fetch client info:', err);
    }

    return {
      metaApiAccountId: accountId,
      server: cleanServer,
      login: cleanLogin,
      name: name || `MT5-${cleanLogin}`,
      balance: clientInfo?.balance || 0,
      equity: clientInfo?.equity || clientInfo?.balance || 0,
      currency: clientInfo?.currency || 'USD',
      broker: clientInfo?.broker || cleanServer
    };
  },

  // 3. Sinkronisasi Data Transaksi & Saldo dari MT5 ke Trading Suite
  async syncAccount(tsAccount, progressCallback) {
    if (!tsAccount || !tsAccount.metaApiAccountId) {
      throw new Error('Akun ini tidak memiliki ID MetaApi.');
    }

    const metaId = tsAccount.metaApiAccountId;
    if (progressCallback) progressCallback('Mengambil saldo akun terbaru...');

    // A. Update Account Balance & Info
    let clientInfo = null;
    try {
      clientInfo = await this.request(`${this.CLIENT_API}/users/current/accounts/${metaId}/account-information`);
      if (clientInfo) {
        const allAccs = DB.getAccounts();
        const accIdx = allAccs.findIndex(a => a.AccountID === tsAccount.AccountID);
        if (accIdx !== -1) {
          allAccs[accIdx].InitialBalance = clientInfo.balance;
          allAccs[accIdx].Balance = clientInfo.balance;
          allAccs[accIdx].Equity = clientInfo.equity;
          if (clientInfo.currency) allAccs[accIdx].Currency = clientInfo.currency;
          allAccs[accIdx].lastSync = new Date().toISOString();
          DB.savAccounts(allAccs);
          App.state.accounts = allAccs;
        }
      }
    } catch (e) {
      console.warn('Gagal refresh account info:', e);
    }

    // B. Ambil Riwayat Deals (Trade tertutup)
    if (progressCallback) progressCallback('Mengunduh riwayat transaksi MT5...');
    
    // Dari 1 tahun yang lalu sampai sekarang
    const startTime = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const endTime = new Date().toISOString();

    let deals = [];
    try {
      deals = await this.request(`${this.CLIENT_API}/users/current/accounts/${metaId}/history-deals/time/${encodeURIComponent(startTime)}/${encodeURIComponent(endTime)}`);
    } catch (e) {
      console.error('Gagal mengambil history deals:', e);
      throw new Error('Gagal mengambil riwayat transaksi dari MetaApi: ' + e.message);
    }

    if (!Array.isArray(deals)) deals = [];

    // Filter deals: hanya ambil deal yang keluar/selesai dengan profit/loss (bukan deposit/withdrawal)
    const validTrades = deals.filter(deal => {
      // Abaikan deposit / balance adjust
      if (deal.type === 'DEAL_TYPE_BALANCE' || deal.type === 'DEAL_TYPE_CREDIT') return false;
      // MT5 deal entry: OUT (close position) atau INOUT
      const isExit = deal.entryType === 'DEAL_ENTRY_OUT' || deal.entryType === 'DEAL_ENTRY_INOUT';
      const hasPl = typeof deal.profit === 'number' && (deal.profit !== 0 || deal.commission !== 0);
      return isExit || hasPl;
    });

    const currentTrades = DB.getTrades();
    let newCount = 0;

    validTrades.forEach(deal => {
      const dealIdStr = String(deal.id);
      
      // Cek apakah deal ini sudah pernah disimpan
      const exists = currentTrades.some(t => 
        t.AccountID === tsAccount.AccountID && 
        (t.Ticket === dealIdStr || t.dealId === dealIdStr)
      );

      if (!exists) {
        // Hitung total net profit/loss
        const netPL = (Number(deal.profit) || 0) + (Number(deal.commission) || 0) + (Number(deal.swap) || 0);
        
        // Tentukan posisi BUY / SELL
        let pos = 'BUY';
        if (deal.type === 'DEAL_TYPE_SELL') {
          // Jika deal OUT bertipe SELL, berarti posisi aslinya BUY yang di-close dengan SELL
          pos = deal.entryType === 'DEAL_ENTRY_OUT' ? 'BUY' : 'SELL';
        } else if (deal.type === 'DEAL_TYPE_BUY') {
          pos = deal.entryType === 'DEAL_ENTRY_OUT' ? 'SELL' : 'BUY';
        }

        const dateStr = deal.time ? deal.time.split('T')[0] : new Date().toISOString().split('T')[0];

        const newTrade = {
          TradeID: DB.uid(),
          Ticket: dealIdStr,
          AccountID: tsAccount.AccountID,
          Date: dateStr,
          Pair: deal.symbol || 'XAUUSD',
          Position: pos,
          LotSize: (deal.volume || 0).toFixed(2),
          Entry: 'MT5 Investor Sync',
          ProfitLoss: parseFloat(netPL.toFixed(2)),
          Result: netPL > 0 ? 'Win' : netPL < 0 ? 'Loss' : 'BE',
          PsychologyNotes: `Tiket MT5 #${dealIdStr} · ${deal.comment || 'Auto Synced'}`
        };

        currentTrades.push(newTrade);
        newCount++;
      }
    });

    if (newCount > 0 || clientInfo) {
      DB.savTrades(currentTrades);
      App.state.trades = currentTrades;
      
      // Auto Sync ke Google Drive jika terhubung
      if (typeof GDriveSync !== 'undefined') {
        GDriveSync.triggerAutoSync();
      }
    }

    return {
      newTradesCount: newCount,
      totalDealsFound: validTrades.length,
      balance: clientInfo?.balance ?? tsAccount.InitialBalance,
      currency: clientInfo?.currency ?? tsAccount.Currency
    };
  },

  async quickSyncCurrentAccount() {
    const acc = App.state.currentAccount;
    if (!acc || !acc.metaApiAccountId) {
      App.toast('Akun aktif bukan akun MT5.');
      return;
    }
    await Settings.syncMT5Account(acc.AccountID);
  }
};

window.MetaApiSync = MetaApiSync;
