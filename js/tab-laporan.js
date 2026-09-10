/*
  tab-laporan.js
  --------------
  TAB 3 - Laporan Aktiviti Mingguan.
  Minggu auto-link daripada Tab 1 (Kehadiran), Tajuk/Aktiviti
  auto-link daripada Tab 2 (eRPH). Guru hanya tambah maklumat
  tambahan (guru pembimbing, PPikeBM, refleksi, 4 gambar).
*/

const TabLaporan = {
  currentSessionId: null,
  currentUnitId: null,
  currentMinggu: null,
  newImages: [null, null, null, null],      // dataURL gambar baharu (jika guru upload/tukar)
  existingFileIds: [null, null, null, null], // fileId Drive sedia ada (jika laporan sudah wujud)
  isEditable: true, // false = mod lihat (selepas disimpan)

  init() {
    Shared.populateKategoriSelect(Utils.el('lpKategori'));
    Utils.el('lpKategori').addEventListener('change', (e) => {
      Shared.populateUnitSelect(Utils.el('lpUnit'), e.target.value);
      Utils.el('lpFormCard').classList.add('hidden');
      Utils.el('lpWeekChips').innerHTML = '';
    });
    Shared.populateUnitSelect(Utils.el('lpUnit'), Utils.el('lpKategori').value);

    Utils.el('lpUnit').addEventListener('change', (e) => {
      if (e.target.value) this.loadWeekChips(e.target.value);
    });

    Shared.populateTeacherSelect(Utils.el('lpDisediakanOleh'));

    this.populatePPikeBM();
    this.setupImageInputs();

    Utils.el('lpTarikhPerjumpaan').value = Utils.todayIso();

    Utils.el('lpSimpanBtn').addEventListener('click', () => this.saveReport());
    Utils.el('lpEditBtn').addEventListener('click', () => this.setMode(true));
    Utils.el('lpDeleteBtn').addEventListener('click', () => this.deleteReport());
    Utils.el('lpJanaPdfBtn').addEventListener('click', () => this.generatePdf());

    // Guru Pembimbing: dropdown tertutup lalai (macam Sivik) - klik butang
    // untuk dedah/sembunyi senarai checkbox; klik di luar akan tutup semula.
    Utils.el('lpGuruPembimbingToggle').addEventListener('click', (e) => {
      e.stopPropagation();
      if (Utils.el('lpGuruPembimbingToggle').disabled) return;
      Utils.el('lpGuruPembimbingList').classList.toggle('hidden');
    });
    document.addEventListener('click', (e) => {
      const list = Utils.el('lpGuruPembimbingList');
      const toggle = Utils.el('lpGuruPembimbingToggle');
      if (!list.classList.contains('hidden') && !list.contains(e.target) && e.target !== toggle) {
        list.classList.add('hidden');
      }
    });
  },

  // ---- Togol antara MOD ISI (editable) dan MOD LIHAT (selepas simpan) ----
  setMode(editable) {
    this.isEditable = editable;
    ['lpTarikhPerjumpaan', 'lpPPikeBM', 'lpRefleksi', 'lpDisediakanOleh'].forEach(id => {
      Utils.el(id).disabled = !editable;
    });
    Utils.el('lpGuruPembimbingToggle').disabled = !editable;
    Utils.el('lpGuruPembimbingList').classList.add('hidden');
    Utils.el('lpGuruPembimbingList').querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.disabled = !editable;
    });
    const tandaSemuaBtn = Utils.el('lpTandaSemuaGuruBtn');
    if (tandaSemuaBtn) tandaSemuaBtn.disabled = !editable;
    for (let i = 1; i <= 4; i++) {
      Utils.el('lpGambar' + i).disabled = !editable;
      Utils.el('lpGambar' + i).closest('.image-upload-box').classList.toggle('locked', !editable);
    }
    Utils.el('lpSimpanBtn').classList.toggle('hidden', !editable);
    Utils.el('lpEditBtn').classList.toggle('hidden', editable);
    Utils.el('lpDeleteBtn').classList.toggle('hidden', editable);
  },

  // ---- Guru Pembimbing: multiple choices (checkbox), bukan satu sahaja ----
  // Senarai calon guru datang daripada Guru Penasihat unit ini (jatuh balik
  // kepada semua guru jika belum didaftarkan) - lihat populateGuruPembimbingForUnit.
  renderGuruPembimbingCheckboxes(selectedIds) {
    const container = Utils.el('lpGuruPembimbingList');
    const teachers = this._guruPembimbingTeachers || [];

    if (teachers.length === 0) {
      container.innerHTML = '<p class="hint-text">Tiada guru didaftarkan. Sila daftar guru di Tab Admin.</p>';
      this.updateGuruPembimbingToggleLabel();
      return;
    }

    const toolbarHtml = `
      <div class="student-list-toolbar">
        <button type="button" class="btn btn-ghost btn-sm" id="lpTandaSemuaGuruBtn" ${this.isEditable ? '' : 'disabled'}>Tandakan Semua</button>
      </div>`;

    container.innerHTML = toolbarHtml + teachers.map(t => {
      const checked = selectedIds.includes(String(t.teacherId));
      return `
        <label class="student-row ${checked ? 'checked' : ''}" data-teacher-id="${t.teacherId}">
          <input type="checkbox" ${checked ? 'checked' : ''} ${this.isEditable ? '' : 'disabled'}>
          <span class="student-name">${Utils.escapeHtml(t.nama)}</span>
        </label>`;
    }).join('');

    const tandaSemuaBtn = container.querySelector('#lpTandaSemuaGuruBtn');
    tandaSemuaBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      container.querySelectorAll('.student-row').forEach(row => {
        const checkbox = row.querySelector('input[type="checkbox"]');
        if (checkbox.disabled) return;
        checkbox.checked = true;
        row.classList.add('checked');
      });
      this.updateGuruPembimbingToggleLabel();
    });

    container.querySelectorAll('.student-row').forEach(row => {
      const checkbox = row.querySelector('input[type="checkbox"]');
      row.addEventListener('click', (e) => {
        if (checkbox.disabled) return;
        if (e.target.tagName !== 'INPUT') checkbox.checked = !checkbox.checked;
        row.classList.toggle('checked', checkbox.checked);
        this.updateGuruPembimbingToggleLabel();
      });
    });

    this.updateGuruPembimbingToggleLabel();
  },

  // Papar ringkasan pilihan semasa pada butang tertutup (cth: "Cikgu Ali,
  // Cikgu Siti") supaya guru tetap nampak apa yang dipilih tanpa perlu buka.
  updateGuruPembimbingToggleLabel() {
    const btn = Utils.el('lpGuruPembimbingToggle');
    const selectedIds = this.getSelectedGuruPembimbingIds();
    if (selectedIds.length === 0) {
      btn.textContent = '-- Pilih Guru Pembimbing --';
      return;
    }
    const teachers = this._guruPembimbingTeachers || [];
    const names = selectedIds.map(id => {
      const t = teachers.find(t => String(t.teacherId) === id);
      return t ? t.nama : id;
    });
    btn.textContent = names.join(', ');
  },

  getSelectedGuruPembimbingIds() {
    return Array.from(Utils.el('lpGuruPembimbingList').querySelectorAll('input[type="checkbox"]:checked'))
      .map(cb => cb.closest('.student-row').dataset.teacherId);
  },

  // ---- Tunjuk/sembunyi teks placeholder "+ Gambar X" mengikut ada/tiada gambar ----
  toggleImagePlaceholder(slotIndex, hasImage) {
    const box = Utils.el('lpGambar' + slotIndex).closest('.image-upload-box');
    const placeholder = box.querySelector('.image-placeholder-text');
    if (placeholder) placeholder.classList.toggle('hidden', hasImage);
  },

  populatePPikeBM() {
    const select = Utils.el('lpPPikeBM');
    Utils.clearSelect(select, '-- Pilih PPikeBM --');
    (Shared.ppikeBMList || CONFIG.PPIKEBM_LIST).forEach(p => {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p;
      select.appendChild(opt);
    });
  },

  setupImageInputs() {
    for (let i = 1; i <= 4; i++) {
      const input = Utils.el('lpGambar' + i);
      input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const dataUrl = await Utils.compressImageFile(file);
          this.newImages[i - 1] = dataUrl;
          const preview = Utils.el('lpPreview' + i);
          preview.src = dataUrl;
          preview.classList.remove('hidden');
          this.toggleImagePlaceholder(i, true);
        } catch (err) {
          Utils.toast('Gagal memproses gambar. Sila cuba gambar lain.', 'error');
        }
      });
    }
  },

  resetImageState() {
    this.newImages = [null, null, null, null];
    this.existingFileIds = [null, null, null, null];
    for (let i = 1; i <= 4; i++) {
      const input = Utils.el('lpGambar' + i);
      input.value = '';
      const preview = Utils.el('lpPreview' + i);
      preview.src = '';
      preview.classList.add('hidden');
      this.toggleImagePlaceholder(i, false);
    }
  },

  // Hadkan senarai checkbox "Guru Pembimbing" kepada guru yang didaftarkan
  // sebagai Guru Penasihat unit ini (Tab Admin > Penempatan Guru). Jika
  // belum ada sesiapa didaftarkan untuk unit ini, jatuh balik kepada SEMUA
  // guru supaya Tab 3 tetap boleh digunakan tanpa perlu setup Penempatan
  // Guru dahulu.
  async populateGuruPembimbingForUnit(unitId) {
    try {
      const unitTeachers = await Api.call('getUnitTeacherMembers', { unitId, academicYear: Shared.academicYear });
      this._guruPembimbingTeachers = unitTeachers.length > 0
        ? unitTeachers
        : Shared.teachers.filter(t => t.status !== 'Tidak Aktif');
    } catch (err) {
      this._guruPembimbingTeachers = Shared.teachers.filter(t => t.status !== 'Tidak Aktif');
    }
    this.renderGuruPembimbingCheckboxes([]);
  },

  async loadWeekChips(unitId) {
    this.currentUnitId = unitId;
    this.populateGuruPembimbingForUnit(unitId);
    try {
      Utils.showLoading('Menyemak minggu berkaitan...');
      const weeks = await Api.call('getWeeksWithSession', { unitId, academicYear: Shared.academicYear });
      const container = Utils.el('lpWeekChips');
      container.innerHTML = '';

      weeks.forEach(w => {
        const chip = document.createElement('button');
        chip.className = 'week-chip ' + (w.available ? 'available' : 'disabled');
        chip.textContent = `MINGGU ${w.minggu}` + (w.reportFilled ? ' ✅' : '');
        chip.addEventListener('click', () => {
          if (!w.available) {
            Utils.el('lpWeekHint').textContent = 'Tiada rekod kehadiran untuk minggu ini. Sila lengkapkan Rekod Kehadiran terlebih dahulu.';
            Utils.el('lpFormCard').classList.add('hidden');
            return;
          }
          container.querySelectorAll('.week-chip').forEach(c => c.classList.remove('selected'));
          chip.classList.add('selected');
          this.loadReportForm(w.minggu, w.sessionId);
        });
        container.appendChild(chip);
      });

      Utils.el('lpWeekHint').textContent = weeks.some(w => w.available)
        ? 'Pilih minggu (hijau) untuk isi Laporan Mingguan.'
        : 'Tiada rekod kehadiran untuk minggu ini. Sila lengkapkan Rekod Kehadiran terlebih dahulu.';

    } catch (err) {
      Utils.toast(Utils.friendlyError(err), 'error');
    } finally {
      Utils.hideLoading();
    }
  },

  async loadReportForm(minggu, sessionId) {
    this.currentMinggu = minggu;
    this.currentSessionId = sessionId;
    this.resetImageState();

    try {
      Utils.showLoading('Memuatkan data laporan...');
      const data = await Api.call('getReportEntryData', { sessionId });

      Utils.el('lpMingguDisplay').value = `Minggu ${minggu}`;
      Utils.el('lpTajukDisplay').value = data.tajukAktiviti || '(Sila lengkapkan eRPH dahulu)';
      Utils.el('lpAktivitiDisplay').value = data.aktiviti || '';

      const report = data.report || {};
      Utils.el('lpTarikhPerjumpaan').value = Utils.toDateInputValue(report.tarikhPerjumpaan) || Utils.todayIso();

      // guruPembimbing disimpan sebagai satu string ID dipisah koma
      // (cth: "TCH_1,TCH_2") supaya boleh sokong >1 guru tanpa jadual baharu.
      const selectedGuruIds = report.guruPembimbing
        ? String(report.guruPembimbing).split(',').map(s => s.trim()).filter(Boolean)
        : [];
      this.renderGuruPembimbingCheckboxes(selectedGuruIds);

      Utils.el('lpPPikeBM').value = report.ppikeBM || '';
      Utils.el('lpRefleksi').value = report.refleksi || '';
      Utils.el('lpDisediakanOleh').value = report.disediakanOleh || '';

      // NOTA: guna getImageAsBase64 (bukan report.gambarUrls terus) supaya
      // pratonton gambar sentiasa terpapar. URL Google Drive ("uc?export=view")
      // sering GAGAL dimuatkan terus dalam tag <img> (Drive menyekat hotlink/
      // memerlukan sesi log masuk Google aktif dalam pelayar) - punca ikon
      // gambar pecah yang dilaporkan guru. Ambil bait sebenar melalui backend
      // (akses penuh DriveApp) sebagai data URL, sama seperti kaedah Jana PDF.
      const fileIds = report.gambarFileIds || [];
      const dataUrls = await Promise.all(fileIds.map(async (fileId) => {
        if (!fileId) return null;
        try {
          const result = await Api.call('getImageAsBase64', { fileId });
          return result.dataUrl;
        } catch (e) {
          console.error(e);
          return null;
        }
      }));
      dataUrls.forEach((dataUrl, idx) => {
        if (!dataUrl) return;
        this.existingFileIds[idx] = fileIds[idx];
        const preview = Utils.el('lpPreview' + (idx + 1));
        preview.src = dataUrl;
        preview.classList.remove('hidden');
        this.toggleImagePlaceholder(idx + 1, true);
      });

      Utils.el('lpFormCard').classList.remove('hidden');
      // Jika laporan sudah wujud untuk minggu ini, buka dalam mod lihat
      // (terkunci); jika belum, buka terus dalam mod isi.
      this.setMode(!data.report);
    } catch (err) {
      Utils.toast(Utils.friendlyError(err), 'error');
    } finally {
      Utils.hideLoading();
    }
  },

  async saveReport() {
    const guruPembimbingIds = this.getSelectedGuruPembimbingIds();
    const disediakanOleh = Utils.el('lpDisediakanOleh').value;
    const ppikeBM = Utils.el('lpPPikeBM').value;

    if (guruPembimbingIds.length === 0) return Utils.toast('Sila tandakan sekurang-kurangnya seorang Guru Pembimbing.', 'error');
    if (!ppikeBM) return Utils.toast('Sila pilih PPikeBM.', 'error');
    if (!disediakanOleh) return Utils.toast('Sila pilih Disediakan Oleh.', 'error');

    const images = [0, 1, 2, 3].map(i => {
      if (this.newImages[i]) return { status: 'new', data: this.newImages[i] };
      if (this.existingFileIds[i]) return { status: 'keep', fileId: this.existingFileIds[i] };
      return { status: 'empty' };
    });

    const payload = {
      sessionId: this.currentSessionId,
      unitId: this.currentUnitId,
      minggu: this.currentMinggu,
      academicYear: Shared.academicYear,
      tarikhPerjumpaan: Utils.el('lpTarikhPerjumpaan').value,
      guruPembimbing: guruPembimbingIds.join(','),
      ppikeBM,
      refleksi: Utils.el('lpRefleksi').value.trim(),
      disediakanOleh,
      images
    };

    try {
      Utils.showLoading('Menyimpan laporan (memuat naik gambar)...');
      await Api.call('saveWeeklyReport', payload);
      Utils.toast('Laporan Mingguan berjaya disimpan.', 'success');
      this.setMode(false);
    } catch (err) {
      Utils.toast(Utils.friendlyError(err), 'error');
    } finally {
      Utils.hideLoading();
    }
  },

  async deleteReport() {
    if (!this.currentSessionId) return;
    const ok = await Utils.confirmModal(
      `Padam Laporan Mingguan bagi Minggu ${this.currentMinggu}? Minggu ini akan kembali ke keadaan belum diisi. Gambar yang telah dimuat naik tidak akan dipadam daripada Google Drive.`,
      'Sahkan Padam Laporan'
    );
    if (!ok) return;

    try {
      Utils.showLoading('Memadam laporan...');
      await Api.call('deleteWeeklyReport', { sessionId: this.currentSessionId });
      Utils.toast('Laporan Mingguan berjaya dipadam.', 'success');

      Utils.el('lpTarikhPerjumpaan').value = Utils.todayIso();
      this.renderGuruPembimbingCheckboxes([]);
      Utils.el('lpPPikeBM').value = '';
      Utils.el('lpRefleksi').value = '';
      Utils.el('lpDisediakanOleh').value = '';
      this.resetImageState();
      this.setMode(true);
    } catch (err) {
      Utils.toast(Utils.friendlyError(err), 'error');
    } finally {
      Utils.hideLoading();
    }
  },

  async generatePdf() {
    if (!this.currentSessionId) return Utils.toast('Sila pilih minggu terlebih dahulu.', 'error');

    try {
      Utils.showLoading('Menjana PDF Laporan...');
      const unit = Shared.getUnitById(this.currentUnitId);
      const teacherName = (id) => {
        const t = Shared.teachers.find(t => String(t.teacherId) === String(id));
        return t ? t.nama : '-';
      };
      const teacherNames = (ids) => ids.length ? ids.map(teacherName).join(', ') : '-';

      const doc = PdfHelper.newDoc();
      let y = await PdfHelper.drawHeader(doc, ['LAPORAN AKTIVITI MINGGUAN', `${unit ? unit.namaUnit : ''} - MINGGU ${this.currentMinggu}`]);

      const rows = [
        ['Tarikh Perjumpaan', Utils.formatDateDisplay(Utils.el('lpTarikhPerjumpaan').value)],
        ['Guru Pembimbing', teacherNames(this.getSelectedGuruPembimbingIds())],
        ['Tajuk Aktiviti', Utils.el('lpTajukDisplay').value],
        ['Aktiviti', Utils.el('lpAktivitiDisplay').value],
        ['PPikeBM', Utils.el('lpPPikeBM').value],
        ['Refleksi / Impak', Utils.el('lpRefleksi').value],
        ['Disediakan Oleh', teacherName(Utils.el('lpDisediakanOleh').value)]
      ];

      doc.setFontSize(10);
      rows.forEach(([label, value]) => {
        y = PdfHelper.ensureSpace(doc, y, 14);
        doc.setFont('helvetica', 'bold');
        doc.text(label + ':', 14, y);
        doc.setFont('helvetica', 'normal');
        const lines = doc.splitTextToSize(String(value || '-'), 130);
        doc.text(lines, 60, y);
        y += Math.max(6, lines.length * 5) + 2;
      });

      // Gambar (2 x 2 grid). Daripada memaksa muka surat baharu bila ruang
      // tidak cukup (yang boleh hasilkan PDF 2 muka surat), KECILKAN saiz
      // gambar supaya sentiasa muat dalam ruang BAKI pada muka surat yang
      // sama - PDF kekal 1 muka surat walaupun pengisian maklumat banyak.
      // Had minimum 32mm supaya gambar tidak jadi terlalu kecil untuk
      // dilihat; jika ruang benar-benar tidak cukup walaupun pada saiz
      // minimum, barulah muka surat baharu digunakan sebagai jalan terakhir.
      const pageHeight = doc.internal.pageSize.getHeight();
      const bottomMargin = 15;
      const labelHeight = 5;
      const rowGap = 5;
      const availableHeight = pageHeight - bottomMargin - y - labelHeight - rowGap;
      const idealImgSize = Math.floor(availableHeight / 2);
      let imgSize = Math.max(32, Math.min(80, idealImgSize));

      if (idealImgSize < 32) {
        // Ruang benar-benar tidak cukup walaupun pada saiz minimum - jalan
        // terakhir, mulakan muka surat baharu untuk gambar sahaja.
        doc.addPage();
        y = 20;
        imgSize = 80;
      }

      doc.setFont('helvetica', 'bold');
      doc.text('Gambar Aktiviti:', 14, y);
      y += labelHeight;

      const positions = [[14, y], [102, y], [14, y + imgSize + rowGap], [102, y + imgSize + rowGap]];

      // Sediakan data setiap gambar: guna dataURL baharu (jika baru diupload
      // sesi ini) atau ambil bait sebenar daripada Google Drive melalui
      // backend (jsPDF tidak boleh muat turun URL luar, dan URL Drive tidak
      // menghantar header CORS yang membolehkan canvas browser membacanya -
      // jadi tanpa langkah ini, gambar laporan LAMA akan hilang dalam PDF).
      const imageDataList = await Promise.all([0, 1, 2, 3].map(async (i) => {
        if (this.newImages[i]) return this.newImages[i];
        if (this.existingFileIds[i]) {
          try {
            const result = await Api.call('getImageAsBase64', { fileId: this.existingFileIds[i] });
            return result.dataUrl;
          } catch (e) {
            console.error(e);
            return null;
          }
        }
        return null;
      }));

      imageDataList.forEach((imgData, i) => {
        if (!imgData) return;
        try { doc.addImage(imgData, 'JPEG', positions[i][0], positions[i][1], imgSize, imgSize); } catch (e) { /* abaikan jika format tidak serasi */ }
      });

      PdfHelper.drawFooter(doc);
      doc.save(`Laporan_${unit ? unit.namaUnit : 'Unit'}_Minggu${this.currentMinggu}.pdf`);
    } catch (err) {
      Utils.toast(Utils.friendlyError(err), 'error');
    } finally {
      Utils.hideLoading();
    }
  }
};
