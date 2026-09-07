/*
  api.js
  ------
  Satu-satunya tempat frontend bercakap dengan Google Apps Script.
  Semua tab (kehadiran, erph, laporan, analisis, admin) panggil Api.call()
  sahaja - tiada logic Google Sheets di sini, hanya "penghantar surat".

  Nota teknikal: content-type dihantar sebagai 'text/plain' (bukan
  application/json) supaya browser TIDAK menghantar OPTIONS preflight
  request - Google Apps Script Web App tidak mengendalikan preflight
  dengan baik, jadi ini adalah penyelesaian standard yang digunakan.
*/

const Api = {
  async call(action, payload = {}, requireAdmin = false) {
    if (!CONFIG.WEBAPP_URL || CONFIG.WEBAPP_URL.indexOf('PASTE_') === 0) {
      throw new Error('Sistem belum disambungkan ke pelayan (WEBAPP_URL belum ditetapkan dalam config.js).');
    }

    const body = { action, payload };
    if (requireAdmin) {
      body.adminToken = sessionStorage.getItem(CONFIG.ADMIN_SESSION_KEY) || '';
    }

    let response;
    try {
      response = await fetch(CONFIG.WEBAPP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body)
      });
    } catch (networkErr) {
      throw new Error('Tidak dapat menghubungi pelayan. Sila semak sambungan internet.');
    }

    if (!response.ok) {
      throw new Error('Pelayan tidak memberi respons dengan betul. Sila cuba lagi.');
    }

    let json;
    try {
      json = await response.json();
    } catch (parseErr) {
      throw new Error('Respons pelayan tidak sah. Sila cuba lagi.');
    }

    if (json.status !== 'success') {
      throw new Error(json.message || 'Ralat tidak diketahui berlaku.');
    }
    return json.data;
  }
};
