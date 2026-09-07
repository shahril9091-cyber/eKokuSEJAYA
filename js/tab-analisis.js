/*
  tab-analisis.js
  ---------------
  TAB 4 - Analisis eKOKUM.
  Semua statistik dikira secara LIVE daripada Google Sheet (melalui
  GAS) mengikut penapis yang guru pilih. Tiada data dummy digunakan.
*/

const TabAnalisis = {
  barChart: null,
  pieChart: null,

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

      // PENTING: tangguhkan lukisan carta ke frame seterusnya (selepas
      // pelayar selesai "layout" kad yang baru dinyahsembunyi di atas).
      // Jika Chart.js dicipta serta-merta dalam tick yang sama seperti
      // classList.remove('hidden'), ia boleh mengukur tinggi bekas sebagai
      // 0px (bekas belum selesai "reflow") - graf bar amat sensitif kepada
      // ini (paksi memerlukan tinggi sebenar) berbanding carta pai.
      requestAnimationFrame(() => {
        // Jika satu unit spesifik dipilih, banding "Kehadiran Mengikut Unit"
        // akan merosot kepada satu bar sahaja (tidak berguna). Dalam kes itu,
        // papar trend merentasi minggu untuk unit tersebut - lebih sepadan
        // dengan contoh analisis dalam spesifikasi ("Unit -> Minggu 1-12").
        if (filters.unitId) {
          Utils.el('anBarChartTitle').textContent = 'Kehadiran Mengikut Minggu';
          this.renderBarChart((result.byMinggu || []).map(m => ({ unitNama: m.unitNama, hadir: m.hadir, tidakHadir: m.tidakHadir })));
        } else {
          Utils.el('anBarChartTitle').textContent = 'Kehadiran Mengikut Unit';
          this.renderBarChart(result.byUnit || []);
        }
        this.renderPieChart(result.jumlahHadir, result.jumlahTidakHadir);
      });

    } catch (err) {
      Utils.toast(Utils.friendlyError(err), 'error');
    } finally {
      Utils.hideLoading();
    }
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
  },

  renderPieChart(hadir, tidakHadir) {
    if (this.pieChart) this.pieChart.destroy();
    const ctx = Utils.el('anPieChart').getContext('2d');
    this.pieChart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: ['Hadir', 'Tidak Hadir'],
        datasets: [{ data: [hadir, tidakHadir], backgroundColor: ['#34c281', '#ef5a6f'] }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#1e293b' } } }
      }
    });
  }
};
