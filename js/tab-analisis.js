/*
  tab-analisis.js
  ---------------
  TAB 4 - Analisis eKOKUM.
  Semua statistik dikira secara LIVE daripada Google Sheet (melalui
  GAS) mengikut penapis yang guru pilih. Tiada data dummy digunakan.
*/

const TabAnalisis = {
  barChart: null,

  init() {
    Utils.clearSelect(Utils.el('anKategori'), 'Semua Kategori');
    CONFIG.KATEGORI_LIST.forEach(k => {
      const opt = document.createElement('option');
      opt.value = k; opt.textContent = k;
      Utils.el('anKategori').appendChild(opt);
    });

    Shared.populateAllUnitsSelect(Utils.el('anUnit'), 'Semua Unit');
    Shared.populateWeekSelect(Utils.el('anMinggu'), true);
    Shared.populateTahunSelect(Utils.el('anTahun'), true);

    Utils.el('anKategori').addEventListener('change', (e) => {
      if (!e.target.value) {
        Shared.populateAllUnitsSelect(Utils.el('anUnit'), 'Semua Unit');
      } else {
        Shared.populateUnitSelect(Utils.el('anUnit'), e.target.value, 'Semua Unit');
      }
    });

    Utils.el('anPaparBtn').addEventListener('click', () => this.loadAnalytics());
  },

  async loadAnalytics() {
    const filters = {
      kategori: Utils.el('anKategori').value,
      unitId: Utils.el('anUnit').value,
      minggu: Utils.el('anMinggu').value,
      tahun: Utils.el('anTahun').value,
      academicYear: Shared.academicYear
    };

    try {
      Utils.showLoading('Menganalisis data...');
      const result = await Api.call('getAnalytics', filters);

      if (!result.hasData) {
        Utils.el('anEmptyState').textContent = 'Tiada data kehadiran untuk dipaparkan.';
        Utils.el('anEmptyState').classList.remove('hidden');
        Utils.el('anStatsArea').classList.add('hidden');
        return;
      }

      Utils.el('anEmptyState').classList.add('hidden');
      Utils.el('anStatsArea').classList.remove('hidden');

      Utils.el('anJumlahMurid').textContent = result.jumlahMurid;
      Utils.el('anJumlahHadir').textContent = result.jumlahHadir;
      Utils.el('anJumlahTidakHadir').textContent = result.jumlahTidakHadir;
      Utils.el('anPeratusKehadiran').textContent = result.peratus + '%';

      this.renderErphTable(result.erphList || []);
      this.renderLaporanTable(result.laporanList || []);

      // PENTING: tangguhkan lukisan carta ke DUA frame seterusnya (bukan
      // satu) - selepas 2 jadual besar (eRPH/Laporan) turut ditambah dalam
      // kad yang sama, satu requestAnimationFrame sahaja kadangkala tidak
      // cukup untuk pelayar selesai "layout" sepenuhnya sebelum Chart.js
      // mengukur tinggi bekas (boleh terbaca 0px dan carta senyap kosong).
      // Turut dibalut try/catch supaya jika Chart.js gagal dimuat (cth.
      // disekat rangkaian sekolah), guru nampak mesej jelas - bukan kosong
      // senyap tanpa sebarang petunjuk.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            Utils.el('anChartError').classList.add('hidden');
            Utils.el('anBarChart').classList.remove('hidden');
            this.renderBarChart(result.byUnit || []);
          } catch (chartErr) {
            console.error(chartErr);
            Utils.el('anBarChart').classList.add('hidden');
            Utils.el('anChartError').classList.remove('hidden');
          }
        });
      });

    } catch (err) {
      Utils.toast(Utils.friendlyError(err), 'error');
    } finally {
      Utils.hideLoading();
    }
  },

  // ---- Data eRPH merentasi setiap Unit Beruniform, Kelab & Sukan yang
  // sepadan penapis (Kategori/Unit/Minggu) semasa di atas ----
  renderErphTable(erphList) {
    const table = Utils.el('anErphTable');
    const emptyState = Utils.el('anErphEmptyState');

    if (erphList.length === 0) {
      table.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }
    emptyState.classList.add('hidden');

    table.innerHTML = `
      <thead><tr>
        <th>Unit</th><th>Kategori</th><th>Minggu</th><th>Tarikh</th>
        <th>Tajuk Aktiviti</th><th>Sivik</th><th>Bil. Murid</th>
      </tr></thead>
      <tbody>
        ${erphList.map(e => `
          <tr>
            <td>${Utils.escapeHtml(e.unitNama)}</td>
            <td>${Utils.escapeHtml(e.kategori)}</td>
            <td>Minggu ${e.minggu}</td>
            <td>${Utils.formatDateDisplay(e.tarikh)}</td>
            <td>${Utils.escapeHtml(e.tajukAktiviti)}</td>
            <td>${Utils.escapeHtml(e.sivik)}</td>
            <td>${Utils.escapeHtml(String(e.bilanganMurid))}</td>
          </tr>`).join('')}
      </tbody>`;
  },

  // ---- Data Laporan Mingguan merentasi setiap Unit Beruniform, Kelab &
  // Sukan yang sepadan penapis (Kategori/Unit/Minggu) semasa di atas ----
  renderLaporanTable(laporanList) {
    const table = Utils.el('anLaporanTable');
    const emptyState = Utils.el('anLaporanEmptyState');

    if (laporanList.length === 0) {
      table.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }
    emptyState.classList.add('hidden');

    table.innerHTML = `
      <thead><tr>
        <th>Unit</th><th>Kategori</th><th>Minggu</th><th>Tarikh Perjumpaan</th>
        <th>Guru Penasihat</th><th>PPikeBM</th><th>Disediakan Oleh</th>
      </tr></thead>
      <tbody>
        ${laporanList.map(r => `
          <tr>
            <td>${Utils.escapeHtml(r.unitNama)}</td>
            <td>${Utils.escapeHtml(r.kategori)}</td>
            <td>Minggu ${r.minggu}</td>
            <td>${Utils.formatDateDisplay(r.tarikh)}</td>
            <td>${Utils.escapeHtml(r.guruPembimbing)}</td>
            <td>${Utils.escapeHtml(r.ppikeBM)}</td>
            <td>${Utils.escapeHtml(r.disediakanOleh)}</td>
          </tr>`).join('')}
      </tbody>`;
  },

  renderBarChart(byUnit) {
    if (this.barChart) this.barChart.destroy();
    const ctx = Utils.el('anBarChart').getContext('2d');
    this.barChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: byUnit.map(u => u.unitNama),
        datasets: [
          { label: 'Hadir', data: byUnit.map(u => u.hadir), backgroundColor: '#34c281' },
          { label: 'Tidak Hadir', data: byUnit.map(u => u.tidakHadir), backgroundColor: '#ef5a6f' }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false, // .chart-box kini mengawal tinggi sebenar (lihat style.css)
        plugins: { legend: { labels: { color: '#1e293b' } } },
        scales: {
          x: { ticks: { color: '#64748b' }, grid: { color: '#e2e8f0' } },
          y: { ticks: { color: '#64748b' }, grid: { color: '#e2e8f0' }, beginAtZero: true }
        }
      }
    });
  }
};
