/*
  utils.js
  --------
  Fungsi-fungsi kecil yang digunakan berulang kali di seluruh sistem:
  paparan tarikh/masa, toast mesej, loading overlay, modal confirm,
  bacaan teks bulk-paste, dan pemampatan gambar sebelum upload.
*/

const Utils = {

  // ---- Tarikh & Masa (Asia/Kuala_Lumpur) ----
  formatDateLive(date) {
    return new Intl.DateTimeFormat(CONFIG.LOCALE, {
      timeZone: CONFIG.TIMEZONE,
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    }).format(date).toUpperCase();
  },

  formatTimeLive(date) {
    return new Intl.DateTimeFormat(CONFIG.LOCALE, {
      timeZone: CONFIG.TIMEZONE,
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    }).format(date);
  },

  todayIso() {
    // Tarikh semasa dalam format YYYY-MM-DD ikut timezone Malaysia (untuk default input tarikh)
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: CONFIG.TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const map = {};
    parts.forEach(p => map[p.type] = p.value);
    return `${map.year}-${map.month}-${map.day}`;
  },

  // ---- Normalisasi nilai Tarikh/Masa daripada backend kepada format yang
  // input type="date"/"time" WAJIB terima ("YYYY-MM-DD" / "HH:MM").
  // Kadangkala Google Sheets tersilap tukar sel yang sepatutnya teks biasa
  // (cth "2026-09-06" atau "08:00") kepada nilai tarikh/masa SEBENAR - bila
  // ini berlaku, backend memulangkan rentetan ISO penuh (cth
  // "2026-09-05T16:00:00.000Z" atau "1899-12-30T07:39:35.000Z" bagi masa).
  // Assign terus rentetan sebegitu kepada .value input HTML5 GAGAL SENYAP -
  // pelayar tolak format tidak sah dan medan jadi KOSONG tanpa sebarang
  // ralat, seolah-olah data hilang walaupun ia sebenarnya masih ada di
  // pelayan. Fungsi ini kesan bentuk rentetan tersebut dan pulihkan nilai
  // yang boleh dipaparkan, mengambil kira timezone Malaysia supaya tarikh
  // tidak tersasar sehari akibat penukaran UTC di dalam rentetan ISO itu.
  toDateInputValue(raw) {
    if (!raw) return '';
    const str = String(raw);
    const clean = str.match(/^(\d{4}-\d{2}-\d{2})$/);
    if (clean) return clean[1];
    const d = new Date(str);
    if (isNaN(d.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: CONFIG.TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(d);
    const map = {};
    parts.forEach(p => map[p.type] = p.value);
    return `${map.year}-${map.month}-${map.day}`;
  },

  toTimeInputValue(raw) {
    if (!raw) return '';
    const str = String(raw);
    const clean = str.match(/^(\d{2}:\d{2})(:\d{2})?$/);
    if (clean) return clean[1];
    const d = new Date(str);
    if (isNaN(d.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: CONFIG.TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(d);
    const map = {};
    parts.forEach(p => map[p.type] = p.value);
    return `${map.hour}:${map.minute}`;
  },

  formatDateDisplay(isoDate) {
    if (!isoDate) return '-';

    // Terima pelbagai bentuk input dengan selamat: objek Date sebenar,
    // string "YYYY-MM-DD" bersih, ATAU string ISO penuh (cth: sekiranya
    // Google Sheets/Apps Script pulangkan cap masa penuh seperti
    // "2026-09-07T00:00:00.000Z" - menambah "T00:00:00" terus pada string
    // sebegini akan hasilkan tarikh tidak sah dan RANAP dengan ralat
    // "Invalid time value". Ambil 10 aksara pertama (bahagian tarikh
    // sahaja) sebelum bina semula supaya sentiasa selamat.
    let d;
    if (isoDate instanceof Date) {
      d = isoDate;
    } else {
      const datePart = String(isoDate).slice(0, 10);
      d = new Date(datePart + 'T00:00:00');
    }

    if (isNaN(d.getTime())) return String(isoDate); // fallback selamat - jangan ranap
    return new Intl.DateTimeFormat(CONFIG.LOCALE, { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
  },

  // ---- Toast mesej ringkas (success / error) ----
  toast(message, type = 'success', duration = 3500) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('toast-show'));
    setTimeout(() => {
      el.classList.remove('toast-show');
      setTimeout(() => el.remove(), 300);
    }, duration);
  },

  // ---- Loading overlay global ----
  showLoading(message = 'Memuatkan...') {
    const overlay = document.getElementById('loadingOverlay');
    const text = document.getElementById('loadingText');
    if (text) text.textContent = message;
    if (overlay) overlay.classList.remove('hidden');
  },

  hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.add('hidden');
  },

  // ---- Modal confirm (Promise-based, ganti window.confirm) ----
  confirmModal(message, title = 'Sahkan Tindakan') {
    return new Promise((resolve) => {
      const modal = document.getElementById('confirmModal');
      document.getElementById('confirmModalTitle').textContent = title;
      document.getElementById('confirmModalMessage').textContent = message;
      modal.classList.remove('hidden');

      const btnYes = document.getElementById('confirmModalYes');
      const btnNo = document.getElementById('confirmModalNo');

      const cleanup = (result) => {
        modal.classList.add('hidden');
        btnYes.removeEventListener('click', onYes);
        btnNo.removeEventListener('click', onNo);
        resolve(result);
      };
      const onYes = () => cleanup(true);
      const onNo = () => cleanup(false);

      btnYes.addEventListener('click', onYes);
      btnNo.addEventListener('click', onNo);
    });
  },

  // ---- Escape HTML supaya nama murid/guru selamat dipaparkan ----
  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  // ---- Parse teks bulk-paste (dari Excel: dipisah TAB atau koma) ----
  // Baris pertama dianggap header dan diabaikan jika ia mengandungi perkataan header biasa.
  parseBulkPaste(rawText) {
    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return [];

    const splitLine = (line) => {
      if (line.includes('\t')) return line.split('\t').map(c => c.trim());
      return line.split(',').map(c => c.trim());
    };

    let rows = lines.map(splitLine);

    // Buang baris pertama HANYA jika setiap sel baris itu SEPADAN TEPAT dengan
    // label header yang dijangka (contoh: "ID", "NAMA", "TAHUN", "KELAS").
    // PENTING: guna padanan TEPAT (bukan "includes"), kerana ramai nama Melayu
    // mengandungi sub-rentetan "ID" (cth: MAJID, HAMID, ZAID, IDRIS) - padanan
    // substring akan tersilap buang baris data murid pertama yang sebenar.
    const HEADER_LABELS = ['ID', 'NAMA', 'TAHUN', 'KELAS', 'STUDENTID', 'TEACHERID'];
    const firstRowCells = rows[0].map(c => String(c).trim().toUpperCase());
    const looksLikeHeader = firstRowCells.some(cell => HEADER_LABELS.includes(cell));
    if (looksLikeHeader) {
      rows = rows.slice(1);
    }
    return rows;
  },

  // ---- Mampatkan gambar sebelum dihantar ke server (elak payload besar) ----
  compressImageFile(file, maxWidth = 1200, quality = 0.7) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Gagal membaca fail gambar.'));
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => reject(new Error('Fail bukan gambar yang sah.'));
        img.onload = () => {
          let { width, height } = img;
          if (width > maxWidth) {
            height = Math.round(height * (maxWidth / width));
            width = maxWidth;
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  },

  // ---- Helper kecil ----
  el(id) { return document.getElementById(id); },

  clearSelect(select, placeholder) {
    select.innerHTML = '';
    if (placeholder) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = placeholder;
      select.appendChild(opt);
    }
  },

  friendlyError(err) {
    // Log teknikal untuk developer (bukan untuk guru)
    console.error(err);

    // Backend (Code.gs) dan api.js sentiasa hantar mesej yang MEMANG sudah
    // mesra-guru dan dalam Bahasa Melayu (cth: "ID Murid ini sudah wujud...",
    // "Sesi admin telah tamat. Sila log masuk semula."). Paparkan terus mesej
    // itu supaya guru tahu SEBAB sebenar dan cara membetulkannya - jangan
    // ganti dengan mesej generik yang menyembunyikan maklumat berguna ini.
    const msg = (err && err.message) ? err.message : '';

    // Hanya jatuh balik kepada mesej generik jika ia kelihatan seperti ralat
    // teknikal JavaScript mentah (bukan mesej yang kita tulis sendiri).
    const looksTechnical = /cannot read|undefined is not|is not a function|unexpected token|null is not|referenceerror|typeerror/i.test(msg);

    if (msg && !looksTechnical) return msg;
    return 'Data gagal diproses. Sila cuba lagi atau semak sambungan internet.';
  }
};
