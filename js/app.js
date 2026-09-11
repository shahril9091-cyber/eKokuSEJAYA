/*
  app.js
  ------
  Entry point sistem:
  - Jam & tarikh live (Asia/Kuala_Lumpur)
  - Navigasi antara 5 tab
  - Memuatkan data kongsi (Unit, Guru, Tahun Akademik) sekali sahaja
    supaya semua tab (Kehadiran/eRPH/Laporan/Analisis/Admin) boleh guna
    tanpa panggil API berulang kali.
*/

// ---- State kongsi merentasi semua tab ----
const Shared = {
  units: [],          // {unitId, namaUnit, kategori, status}
  teachers: [],        // {teacherId, nama, status}
  academicYear: null,
  sivikList: [],        // master data - boleh dikemaskini di Tab Admin
  ppikeBMList: [],       // master data - boleh dikemaskini di Tab Admin

  async loadInitialData() {
    const config = await Api.call('getSystemConfig');
    this.academicYear = config.currentAcademicYear;

    const [units, teachers, sivikList, ppikeBMList] = await Promise.all([
      Api.call('getUnits', { academicYear: this.academicYear }),
      Api.call('getTeachers', { academicYear: this.academicYear }),
      Api.call('getSivikList'),
      Api.call('getPPikeBMList')
    ]);
    this.units = units || [];
    this.teachers = teachers || [];
    this.sivikList = (sivikList && sivikList.length) ? sivikList : CONFIG.SIVIK_LIST;
    this.ppikeBMList = (ppikeBMList && ppikeBMList.length) ? ppikeBMList : CONFIG.PPIKEBM_LIST;
  },

  async refreshUnits() {
    this.units = await Api.call('getUnits', { academicYear: this.academicYear }) || [];
  },

  async refreshTeachers() {
    this.teachers = await Api.call('getTeachers', { academicYear: this.academicYear }) || [];
  },

  getUnitsByKategori(kategori) {
    return this.units.filter(u => u.kategori === kategori && u.status !== 'Tidak Aktif');
  },

  getUnitById(unitId) {
    return this.units.find(u => String(u.unitId) === String(unitId));
  },

  populateKategoriSelect(selectEl) {
    selectEl.innerHTML = '';
    CONFIG.KATEGORI_LIST.forEach(k => {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = k;
      selectEl.appendChild(opt);
    });
  },

  populateUnitSelect(selectEl, kategori, placeholder) {
    Utils.clearSelect(selectEl, placeholder || '-- Pilih Unit --');
    this.getUnitsByKategori(kategori).forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.unitId;
      opt.textContent = u.namaUnit;
      selectEl.appendChild(opt);
    });
    selectEl.disabled = false;
  },

  populateAllUnitsSelect(selectEl, placeholder) {
    Utils.clearSelect(selectEl, placeholder || '-- Semua Unit --');
    this.units.filter(u => u.status !== 'Tidak Aktif').forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.unitId;
      opt.textContent = `${u.namaUnit} (${u.kategori})`;
      selectEl.appendChild(opt);
    });
  },

  populateWeekSelect(selectEl, withAllOption) {
    selectEl.innerHTML = '';
    if (withAllOption) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Semua Minggu';
      selectEl.appendChild(opt);
    }
    for (let i = 1; i <= CONFIG.TOTAL_WEEKS; i++) {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `Minggu ${i}`;
      selectEl.appendChild(opt);
    }
  },

  populateTahunSelect(selectEl, withAllOption) {
    selectEl.innerHTML = '';
    if (withAllOption) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Semua Tahun';
      selectEl.appendChild(opt);
    }
    CONFIG.TAHUN_LIST.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = `Tahun ${t}`;
      selectEl.appendChild(opt);
    });
  },

  populateTeacherSelect(selectEl, placeholder) {
    Utils.clearSelect(selectEl, placeholder || '-- Pilih Guru --');
    this.teachers.filter(t => t.status !== 'Tidak Aktif').forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.teacherId;
      opt.textContent = t.nama;
      selectEl.appendChild(opt);
    });
  }
};

// ---- Jam & Tarikh Live ----
function startLiveClock() {
  const dateEl = Utils.el('liveDate');
  const timeEl = Utils.el('liveTime');
  const tick = () => {
    const now = new Date();
    dateEl.textContent = Utils.formatDateLive(now);
    timeEl.textContent = Utils.formatTimeLive(now);
  };
  tick();
  setInterval(tick, 1000);
}

// ---- Navigasi Tab ----
function setupTabNavigation() {
  const buttons = document.querySelectorAll('.tab-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      Utils.el('tab-' + tabId).classList.add('active');

      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

// Paksa sistem KEMBALI ke tab Kehadiran (menu utama) pada setiap muat/muat
// semula halaman - guru sepatutnya sentiasa mula dari Kehadiran, bukan
// tersangkut pada tab terakhir yang dibuka sebelum refresh (cth: eRPH/
// Laporan Mingguan). Dipanggil juga pada event "pageshow" dengan
// event.persisted=true - ini kes bila pelayar (terutamanya mobile
// Safari/Chrome) muat semula halaman daripada bfcache (in-memory snapshot
// DOM sebelum refresh, termasuk kelas "active" yang sudah ditukar guru
// secara klik) berbanding muat semula sepenuhnya - tanpa pengendalian ini,
// bfcache boleh "kembalikan" tab yang guru sedang buka sebelum refresh
// dan bukan reset ke Kehadiran seperti yang dijangka.
function resetToDefaultTab() {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === 'kehadiran'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-kehadiran'));
}

// ---- Header Info Statik (nama sekolah, dsb) ----
function applyHeaderConfig() {
  Utils.el('schoolNameHeader').textContent = CONFIG.SCHOOL_NAME;
  Utils.el('schoolLocationHeader').textContent = CONFIG.SCHOOL_LOCATION;
  Utils.el('systemNameHeader').textContent = CONFIG.SYSTEM_NAME;
  Utils.el('schoolLogo').src = CONFIG.LOGO_PATH;
  document.title = `${CONFIG.SYSTEM_NAME} - ${CONFIG.SCHOOL_NAME}`;
}

// ---- Inisialisasi Sistem ----
async function initSystem() {
  resetToDefaultTab();
  applyHeaderConfig();
  startLiveClock();
  setupTabNavigation();

  try {
    Utils.showLoading('Memuatkan sistem...');
    await Shared.loadInitialData();
    Utils.el('academicYearBadge').textContent = `Tahun: ${Shared.academicYear}`;
  } catch (err) {
    // PENTING: walaupun data awal gagal dimuatkan (contoh: pelayan belum
    // disediakan, atau internet terputus seketika), JANGAN biarkan itu
    // menghalang tab lain daripada diinisialisasi di bawah - jika tidak,
    // SEMUA butang dalam seluruh sistem akan menjadi "mati" tanpa sebarang
    // cara untuk pulih selain muat semula halaman.
    Utils.toast(Utils.friendlyError(err), 'error', 8000);
    Utils.el('academicYearBadge').textContent = 'Tahun: -';
  } finally {
    Utils.hideLoading();
  }

  // Inisialisasi setiap tab (bind event listeners, isi dropdown asas) -
  // dijalankan tanpa mengira kejayaan/kegagalan di atas.
  TabKehadiran.init();
  TabErph.init();
  TabLaporan.init();
  TabAnalisis.init();
  TabAdmin.init();
}

document.addEventListener('DOMContentLoaded', initSystem);

// Muat semula (refresh) sepenuhnya sentiasa cetuskan DOMContentLoaded di
// atas (yang sudah panggil resetToDefaultTab melalui initSystem). Tambahan
// ini HANYA untuk kes bfcache (lihat nota resetToDefaultTab) - pelayar
// memulihkan snapshot lama TANPA mencetuskan DOMContentLoaded semula.
window.addEventListener('pageshow', (e) => {
  if (e.persisted) resetToDefaultTab();
});
