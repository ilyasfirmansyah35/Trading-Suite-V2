/**
 * Trading Suite - Google Drive AppData Cloud Sync Module
 * Powered by Google Identity Services (GIS) & Google Drive API v3
 * Client ID: 559849926457-onc4mg9p97jqo8hpkvpuvej4239s1qng.apps.googleusercontent.com
 */

const GDriveSync = {
  CLIENT_ID: '559849926457-onc4mg9p97jqo8hpkvpuvej4239s1qng.apps.googleusercontent.com',
  SCOPES: 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
  FILE_NAME: 'trading_suite_data.json',

  _tokenClient: null,
  _accessToken: null,
  _tokenExpiresAt: 0,
  _userProfile: null,
  _fileId: null,
  _isSyncing: false,
  _syncDebounce: null,
  _lastSyncTime: null,
  _silentRefreshPending: false,
  _silentRefreshFailed: false,  // Track if silent refresh already failed this session
  _refreshTimer: null,
  _silentTimeout: null,

  /**
   * Initialize Google Sync module
   */
  async init() {
    // Load stored user profile if available
    try {
      const storedUser = localStorage.getItem('ts_google_user');
      if (storedUser) {
        this._userProfile = JSON.parse(storedUser);
      }
      const storedToken = localStorage.getItem('ts_google_token');
      const storedExp = localStorage.getItem('ts_google_token_exp');
      if (storedToken && storedExp && Date.now() < parseInt(storedExp, 10)) {
        this._accessToken = storedToken;
        this._tokenExpiresAt = parseInt(storedExp, 10);
      }
      this._lastSyncTime = localStorage.getItem('ts_last_sync_time') || null;
    } catch (e) {
      console.warn('Error reading stored google auth:', e);
    }

    // Initialize GIS Token Client when Google library is ready
    this._initGisClient();

    // When app comes back to foreground (e.g. mobile user reopens PWA),
    // attempt silent token refresh ONLY if it hasn't already failed this session
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this._userProfile && this._tokenClient) {
        if (!this._silentRefreshFailed && !this._silentRefreshPending
            && (!this._accessToken || Date.now() >= this._tokenExpiresAt)) {
          console.log('[GDriveSync] App resumed — attempting silent token refresh');
          this._attemptSilentRefresh();
        }
      }
    });
  },

  _initGisClient() {
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
      setTimeout(() => this._initGisClient(), 300);
      return;
    }

    try {
      this._tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: this.CLIENT_ID,
        scope: this.SCOPES,
        callback: async (resp) => {
          // Clear the safety timeout since callback fired
          if (this._silentTimeout) { clearTimeout(this._silentTimeout); this._silentTimeout = null; }

          if (resp.error) {
            console.error('Google Auth Error:', resp);
            if (this._silentRefreshPending) {
              this._silentRefreshPending = false;
              this._silentRefreshFailed = true;  // Don't retry again this session
              this.setSyncingState(false);
              console.log('[GDriveSync] Silent refresh failed, user continues with local data.');
              // Only show login modal on first-ever visit (no saved profile at all)
              if (!this._userProfile) {
                this.showLoginModal();
              }
            } else {
              App.toast('❌ Gagal login Google: ' + resp.error);
              this.setSyncingState(false);
            }
            return;
          }
          if (resp.access_token) {
            const wasSilent = this._silentRefreshPending;
            this._silentRefreshPending = false;
            this._silentRefreshFailed = false;  // Reset on success
            this._accessToken = resp.access_token;
            this._tokenExpiresAt = Date.now() + (parseInt(resp.expires_in, 10) || 3600) * 1000;
            localStorage.setItem('ts_google_token', this._accessToken);
            localStorage.setItem('ts_google_token_exp', String(this._tokenExpiresAt));

            // Schedule proactive refresh before token expires
            this._scheduleTokenRefresh(parseInt(resp.expires_in, 10) || 3600);

            // Fetch user profile
            await this.fetchUserProfile();

            if (wasSilent) {
              this.hideLoginModal();
              await this.handlePostLoginSync();
            } else {
              await this.handlePostLoginSync();
            }
          }
        }
      });

      // After GIS is ready, attempt silent refresh if profile exists but token is expired
      if (this._userProfile && (!this._accessToken || Date.now() >= this._tokenExpiresAt)) {
        this._attemptSilentRefresh();
      } else if (this._accessToken && this._tokenExpiresAt) {
        // Token still valid — schedule proactive refresh
        const remainingSec = Math.floor((this._tokenExpiresAt - Date.now()) / 1000);
        if (remainingSec > 60) {
          this._scheduleTokenRefresh(remainingSec);
        } else {
          this._attemptSilentRefresh();
        }
      }
    } catch (err) {
      console.error('Failed to initTokenClient:', err);
    }
  },

  /**
   * Schedule a proactive token refresh before it expires.
   */
  _scheduleTokenRefresh(expiresInSec) {
    if (this._refreshTimer) clearTimeout(this._refreshTimer);
    const refreshInMs = expiresInSec > 600
      ? (expiresInSec - 300) * 1000
      : Math.floor(expiresInSec / 2) * 1000;
    console.log(`[GDriveSync] Token refresh scheduled in ${Math.round(refreshInMs / 1000)}s`);
    this._refreshTimer = setTimeout(() => {
      console.log('[GDriveSync] Proactive token refresh triggered');
      this._attemptSilentRefresh();
    }, refreshInMs);
  },

  /**
   * Attempt silent token refresh (no popup).
   * Truly silent on mobile — NO overlay shown.
   * Has a 4-second safety timeout in case GIS never fires the callback.
   */
  _attemptSilentRefresh() {
    if (!this._tokenClient) {
      setTimeout(() => this._attemptSilentRefresh(), 500);
      return;
    }
    // Don't retry if already failed this session
    if (this._silentRefreshFailed || this._silentRefreshPending) return;

    console.log('[GDriveSync] Attempting silent token refresh...');
    this._silentRefreshPending = true;
    // NO overlay — silent refresh should be invisible to the user

    // Safety timeout: if GIS callback never fires (common on mobile PWA),
    // abort after 4 seconds so the app doesn't hang
    this._silentTimeout = setTimeout(() => {
      if (this._silentRefreshPending) {
        console.warn('[GDriveSync] Silent refresh timed out after 4s');
        this._silentRefreshPending = false;
        this._silentRefreshFailed = true;
        this.setSyncingState(false);
      }
    }, 4000);

    // prompt: '' = silent (no popup)
    this._tokenClient.requestAccessToken({ prompt: '' });
  },

  /**
   * Request login via GIS popup
   */
  signIn() {
    if (!this._tokenClient) {
      this._initGisClient();
      App.toast('⚠️ Sedang memuat Google Service, silakan coba 2 detik lagi...');
      return;
    }

    this.setSyncingState(true, 'Menghubungkan ke Google...');
    // prompt: 'select_account' forces account picker popup
    this._tokenClient.requestAccessToken({ prompt: 'select_account' });
  },

  /**
   * Sign out and clear stored session
   */
  signOut() {
    if (this._accessToken && typeof google !== 'undefined' && google.accounts?.oauth2?.revoke) {
      try {
        google.accounts.oauth2.revoke(this._accessToken, () => {});
      } catch (e) {}
    }

    this._accessToken = null;
    this._tokenExpiresAt = 0;
    this._userProfile = null;
    this._fileId = null;
    this._lastSyncTime = null;
    if (this._refreshTimer) { clearTimeout(this._refreshTimer); this._refreshTimer = null; }

    localStorage.removeItem('ts_google_token');
    localStorage.removeItem('ts_google_token_exp');
    localStorage.removeItem('ts_google_user');
    localStorage.removeItem('ts_last_sync_time');
    localStorage.removeItem('ts_login_dismissed');

    App.toast('👋 Berhasil keluar dari akun Google');
    
    // Refresh UI
    this.updateUI();
    if (typeof Settings !== 'undefined' && Settings.render) {
      Settings.render();
    }
    // Show login screen
    this.showLoginModal();
  },

  isLoggedIn() {
    return !!this._userProfile && !!this._accessToken && Date.now() < this._tokenExpiresAt;
  },

  hasSavedProfile() {
    return !!this._userProfile;
  },

  getUser() {
    return this._userProfile;
  },

  /**
   * Fetch user info from Google userinfo API
   */
  async fetchUserProfile() {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${this._accessToken}` }
      });
      if (res.ok) {
        this._userProfile = await res.json();
        localStorage.setItem('ts_google_user', JSON.stringify(this._userProfile));
      }
    } catch (e) {
      console.error('Failed to fetch user profile:', e);
    }
  },

  /**
   * Post-login sync handler
   */
  async handlePostLoginSync() {
    this.setSyncingState(true, 'Menyinkronkan data dari Google Drive...');
    try {
      // 1. Check if remote file exists in appDataFolder
      const file = await this.findRemoteFile();

      if (file && file.id) {
        this._fileId = file.id;
        // Download remote data
        const remoteData = await this.downloadFile(file.id);
        if (remoteData && remoteData.accounts) {
          // Restore remote data into local database
          DB.savAccounts(remoteData.accounts || []);
          DB.savTrades(remoteData.trades || []);
          if (remoteData.settings) {
            DB.savSettings(remoteData.settings);
          }
          App.toast('✅ Data trade berhasil dipulihkan dari Google Drive!');
        } else {
          // File exists but empty, upload local
          await this.uploadFile();
        }
      } else {
        // First time user, upload current local state to create remote file
        await this.uploadFile();
        App.toast('✅ Data trade berhasil dicadangkan ke Google Drive!');
      }

      this._lastSyncTime = new Date().toISOString();
      localStorage.setItem('ts_last_sync_time', this._lastSyncTime);

      // Refresh state
      App.state.accounts = DB.getAccounts();
      App.state.settings = DB.getSettings();
      if (App.state.accounts.length > 0) {
        App.setAccount(App.state.accounts[0].AccountID);
      }

      // Hide login screen if open
      this.hideLoginModal();

      // Refresh active view
      if (typeof Dashboard !== 'undefined') Dashboard.render();
      if (typeof Trades !== 'undefined') Trades.render();
      if (typeof Settings !== 'undefined') Settings.render();
    } catch (err) {
      console.error('Post-login sync error:', err);
      App.toast('⚠️ Terjadi kendala sinkronisasi Google Drive');
    } finally {
      this.setSyncingState(false);
      this.updateUI();
    }
  },

  /**
   * Search for trading_suite_data.json in Google Drive appDataFolder
   */
  async findRemoteFile() {
    if (!this._accessToken) return null;
    const q = encodeURIComponent(`name = '${this.FILE_NAME}' and trashed = false`);
    const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,name,modifiedTime)`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this._accessToken}` }
    });
    if (res.status === 401) {
      // Token expired, re-authenticate silently or prompt
      await this.refreshToken();
      return null;
    }
    if (!res.ok) return null;
    const data = await res.json();
    return data.files && data.files.length > 0 ? data.files[0] : null;
  },

  /**
   * Download content from Google Drive
   */
  async downloadFile(fileId) {
    if (!this._accessToken) return null;
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this._accessToken}` }
    });
    if (!res.ok) return null;
    return await res.json();
  },

  /**
   * Upload / Save data to Google Drive appDataFolder
   */
  async uploadFile() {
    if (!this._accessToken) return;

    const payload = {
      version: '2.0',
      updatedAt: new Date().toISOString(),
      user: this._userProfile,
      accounts: DB.getAccounts(),
      trades: DB.getTrades(),
      settings: DB.getSettings()
    };

    const fileContent = JSON.stringify(payload, null, 2);

    // If file already exists, update content via PATCH
    if (this._fileId) {
      const url = `https://www.googleapis.com/upload/drive/v3/files/${this._fileId}?uploadType=media`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${this._accessToken}`,
          'Content-Type': 'application/json'
        },
        body: fileContent
      });
      if (res.ok) {
        this._lastSyncTime = new Date().toISOString();
        localStorage.setItem('ts_last_sync_time', this._lastSyncTime);
        this.updateSyncBadge('synced');
        return;
      }
      // If 404, file might have been deleted, proceed to recreate
      if (res.status === 404) {
        this._fileId = null;
      }
    }

    // Create new file in appDataFolder using multipart upload
    const metadata = {
      name: this.FILE_NAME,
      parents: ['appDataFolder']
    };

    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const closeDelim = "\r\n--" + boundary + "--";

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      fileContent +
      closeDelim;

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this._accessToken}`,
        'Content-Type': 'multipart/related; boundary=' + boundary
      },
      body: multipartRequestBody
    });

    if (res.ok) {
      const result = await res.json();
      this._fileId = result.id;
      this._lastSyncTime = new Date().toISOString();
      localStorage.setItem('ts_last_sync_time', this._lastSyncTime);
      this.updateSyncBadge('synced');
    }
  },

  /**
   * Debounced auto-save to Google Drive
   */
  triggerAutoSync() {
    if (!this.isLoggedIn()) return;

    this.updateSyncBadge('syncing');
    clearTimeout(this._syncDebounce);
    this._syncDebounce = setTimeout(async () => {
      try {
        await this.uploadFile();
      } catch (e) {
        console.warn('Auto-sync failed:', e);
        this.updateSyncBadge('error');
      }
    }, 1200);
  },

  /**
   * Manual force sync button handler
   */
  async manualSync() {
    if (!this.isLoggedIn()) {
      this.signIn();
      return;
    }
    this.setSyncingState(true, 'Menyinkronkan data ke Google Drive...');
    try {
      await this.uploadFile();
      App.toast('✅ Sinkronisasi Google Drive selesai!');
    } catch (e) {
      App.toast('❌ Gagal menyinkronkan data');
    } finally {
      this.setSyncingState(false);
      this.updateUI();
    }
  },

  refreshToken() {
    if (this._tokenClient) {
      this._tokenClient.requestAccessToken({ prompt: '' });
    }
  },

  setSyncingState(syncing, message = '') {
    this._isSyncing = syncing;
    const syncStatusEl = document.getElementById('syncStatusOverlay');
    const syncStatusMsg = document.getElementById('syncStatusMsg');
    if (syncStatusEl) {
      syncStatusEl.style.display = syncing ? 'flex' : 'none';
    }
    if (syncStatusMsg && message) {
      syncStatusMsg.textContent = message;
    }
  },

  updateSyncBadge(status) {
    const el = document.getElementById('cloudSyncStatusPill');
    if (!el) return;
    if (status === 'syncing') {
      el.innerHTML = '<span class="status-dot-blue" style="display:inline-block;animation:ldspin 1s infinite linear">⟳</span> Syncing...';
      el.className = 'cloud-sync-pill syncing';
    } else if (status === 'synced') {
      el.innerHTML = '<span class="status-dot-green">●</span> Google Drive Terhubung';
      el.className = 'cloud-sync-pill synced';
    } else if (status === 'error') {
      el.innerHTML = '<span class="status-dot-red">●</span> Gagal Sync';
      el.className = 'cloud-sync-pill error';
    }
  },

  updateUI() {
    // If in Settings view, re-render
    const setEl = document.getElementById('page-settings');
    if (setEl && !setEl.classList.contains('d-none') && typeof Settings !== 'undefined') {
      Settings.render();
    }
    // If accountSheet is open, refresh MT5 form state
    if (typeof Settings !== 'undefined' && Settings.renderMT5FormState) {
      Settings.renderMT5FormState();
    }
  },

  showLoginModal() {
    // Don't show login modal if silent refresh is in progress
    if (this._silentRefreshPending) return;
    // Don't show if user previously dismissed and has a saved profile (returning user)
    const dismissed = localStorage.getItem('ts_login_dismissed');
    if (dismissed && this._userProfile) return;
    const m = document.getElementById('googleLoginModal');
    if (m) m.style.display = 'flex';
  },

  hideLoginModal() {
    localStorage.setItem('ts_login_dismissed', '1');
    const m = document.getElementById('googleLoginModal');
    if (m) m.style.display = 'none';
  }
};
