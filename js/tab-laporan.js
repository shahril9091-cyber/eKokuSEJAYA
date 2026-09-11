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
  currentMasaMula: null,  // Masa Mula sesi Kehadiran ini (auto-link, untuk PDF sahaja)
  currentMasaTamat: null, // Masa Tamat sesi Kehadiran ini (auto-link, untuk PDF sahaja)
  newImages: [null, null, null, null],      // dataURL gambar baharu (jika guru upload/tukar)
  existingFileIds: [null, null, null, null], // fileId Drive sedia ada (jika laporan sudah wujud)
  isEditable: true, // false = mod lihat (selepas disimpan)

  init() {
    Shared.populateKategoriSelect(Utils.el('lpKategori'));
    Utils.el('lpKategori').addEventListener('change', (e) => {
      Shared.populateUnitSelect(Utils.el('lpUnit'), e.target.value);
      Utils.el('lpFormCard').classList.add('hidden');
      Utils.el('lpWeekChips').innerHTML = '';
      Utils.el('lpWeekHint').textContent = 'Sila pilih unit untuk melihat minggu yang tersedia.';
      this.currentSessionId = null;
      this.currentMinggu = null;
      this.currentUnitId = null;
    });
    Shared.populateUnitSelect(Utils.el('lpUnit'), Utils.el('lpKategori').value);

    Utils.el('lpUnit').addEventListener('change', (e) => {
      // PENTING: sembunyikan borang & kosongkan chip minggu SERTA-MERTA
      // (sebelum data unit baharu selesai dimuatkan) - jika tidak, borang
      // laporan unit LAMA kekal terpapar buat seketika di atas unit BAHARU
      // yang dipilih, mengelirukan guru seolah-olah itu data unit baharu
      // tersebut sedangkan minggu itu sebenarnya belum diisi.
      Utils.el('lpFormCard').classList.add('hidden');
      Utils.el('lpWeekChips').innerHTML = '';
      Utils.el('lpWeekHint').textContent = 'Sila pilih unit untuk melihat minggu yang tersedia.';
      this.currentSessionId = null;
      this.currentMinggu = null;
      this.currentUnitId = e.target.value || null;
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

  // ---- Guru Penasihat: multiple choices (checkbox), bukan satu sahaja ----
  // Senarai calon guru TERHAD kepada Guru Penasihat unit INI sahaja (lihat
  // populateGuruPembimbingForUnit) - tiada lagi jatuh balik kepada senarai
  // SEMUA guru, kerana itu punca bug guru daripada unit lain (cth: semua
  // guru sistem) turut terpapar untuk unit yang belum didaftarkan penasihat.
  renderGuruPembimbingCheckboxes(selectedIds) {
    const container = Utils.el('lpGuruPembimbingList');
    const teachers = this._guruPembimbingTeachers || [];

    if (teachers.length === 0) {
      container.innerHTML = '<p class="hint-text">Tiada Guru Penasihat didaftarkan untuk unit ini. Sila daftarkan di Tab Admin &gt; Penempatan Guru ke Unit.</p>';
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
      btn.textContent = '-- Pilih Guru Penasihat --';
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

  // Hadkan senarai checkbox "Guru Penasihat" kepada guru yang BENAR-BENAR
  // didaftarkan sebagai Guru Penasihat unit INI sahaja (Tab Admin >
  // Penempatan Guru ke Unit). SEBELUM ini, jika belum ada sesiapa
  // didaftarkan untuk unit tertentu, sistem jatuh balik memaparkan SEMUA
  // guru dalam sistem - ini punca bug guru unit LAIN turut kelihatan
  // seolah-olah penasihat unit semasa. Sekarang: jika tiada guru
  // didaftarkan untuk unit ini, senarai kekal KOSONG (lihat mesej dalam
  // renderGuruPembimbingCheckboxes yang arahkan admin ke Tab Admin).
  async populateGuruPembimbingForUnit(unitId) {
    try {
      this._guruPembimbingTeachers = await Api.call('getUnitTeacherMembers', { unitId, academicYear: Shared.academicYear });
    } catch (err) {
      this._guruPembimbingTeachers = [];
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
      this.weekChipsByMinggu = {};

      weeks.forEach(w => {
        const chip = document.createElement('button');
        chip.className = 'week-chip ' + (w.available ? 'available' : 'disabled');
        chip.textContent = `MINGGU ${w.minggu}` + (w.reportFilled ? ' ✅' : '');
        chip.addEventListener('click', () => {
          if (!w.available) {
            Utils.el('lpWeekHint').textContent = 'Tiada rekod kehadiran untuk minggu ini. Sila lengkapkan Rekod Kehadiran terlebih dahulu.';
            Utils.el('lpFormCard').classList.add('hidden');
            Utils.alertModal(`Minggu ${w.minggu} belum diisi (tiada rekod Kehadiran). Sila lengkapkan Rekod Kehadiran untuk minggu ini terlebih dahulu.`, 'Minggu Belum Diisi');
            return;
          }
          container.querySelectorAll('.week-chip').forEach(c => c.classList.remove('selected'));
          chip.classList.add('selected');
          this.loadReportForm(w.minggu, w.sessionId);
        });
        container.appendChild(chip);
        this.weekChipsByMinggu[w.minggu] = chip;
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

  // Tandakan ✅ pada chip minggu serta-merta selepas simpan/padam laporan
  // (macam TabErph.updateLocalWeekData_) - elak guru perlu tukar unit lain
  // dan kembali semula hanya untuk nampak tanda ✅ dikemaskini.
  updateLocalWeekData_(minggu, reportFilled) {
    const chip = (this.weekChipsByMinggu || {})[minggu];
    if (chip) chip.textContent = `MINGGU ${minggu}` + (reportFilled ? ' ✅' : '');
  },

  async loadReportForm(minggu, sessionId) {
    this.currentMinggu = minggu;
    this.currentSessionId = sessionId;
    this.resetImageState();

    try {
      Utils.showLoading('Memuatkan data laporan...');
      const data = await Api.call('getReportEntryData', { sessionId });
      // Bukan medan borang (tiada input di Tab 3 untuk ini) - hanya disimpan
      // untuk dipaparkan dalam PDF Laporan Mingguan (lihat generatePdf).
      this.currentMasaMula = data.masaMula;
      this.currentMasaTamat = data.masaTamat;

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

    if (guruPembimbingIds.length === 0) return Utils.toast('Sila tandakan sekurang-kurangnya seorang Guru Penasihat.', 'error');
    if (!ppikeBM) return Utils.toast('Sila pilih PPikeBM.', 'error');
    if (!disediakanOleh) return Utils.toast('Sila pilih Disediakan Oleh.', 'error');

    const images = [0, 1, 2, 3].map(i => {
      if (this.newImages[i]) return { status: 'new', data: this.newImages[i] };
      if (this.existingFileIds[i]) return { status: 'keep', fileId: this.existingFileIds[i] };
      return { status: 'empty' };
    });

    // Kesemua 4 gambar aktiviti WAJIB diisi sebelum laporan boleh disimpan
    // (keputusan dasar: dokumentasi penuh setiap minggu, bukan sekadar pilihan).
    const missingSlots = images.map((img, i) => img.status === 'empty' ? i + 1 : null).filter(n => n !== null);
    if (missingSlots.length > 0) {
      return Utils.toast(`Sila muat naik kesemua 4 gambar aktiviti (Gambar ${missingSlots.join(', ')} masih kosong).`, 'error', 5000);
    }

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
      this.updateLocalWeekData_(this.currentMinggu, true);
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
      this.updateLocalWeekData_(this.currentMinggu, false);

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
      // Senarai bernombor (satu nama setiap baris) - bukan disambung dengan
      // koma pada satu baris - guna "\n" antara nama supaya
      // doc.splitTextToSize() kekalkan setiap nama pada baris berasingan.
      const teacherNames = (ids) => ids.length
        ? ids.map((id, idx) => `${idx + 1}. ${teacherName(id)}`).join('\n')
        : '-';

      const doc = PdfHelper.newDoc();
      const yStart = await PdfHelper.drawHeader(doc, ['LAPORAN AKTIVITI MINGGUAN', `${unit ? unit.namaUnit : ''} - MINGGU ${this.currentMinggu}`]);

      const rows = [
        ['Tarikh Perjumpaan', Utils.formatDateDisplay(Utils.el('lpTarikhPerjumpaan').value)],
        ['Masa Mula', Utils.formatTimeDisplay(this.currentMasaMula)],
        ['Masa Tamat', Utils.formatTimeDisplay(this.currentMasaTamat)],
        ['Guru Penasihat', teacherNames(this.getSelectedGuruPembimbingIds())],
        ['Tajuk Aktiviti', Utils.el('lpTajukDisplay').value],
        ['Aktiviti', Utils.el('lpAktivitiDisplay').value],
        ['PPikeBM', Utils.el('lpPPikeBM').value],
        ['Refleksi / Impak', Utils.el('lpRefleksi').value],
        ['Disediakan Oleh', teacherName(Utils.el('lpDisediakanOleh').value)]
      ];

      // PENTING: PDF Laporan Mingguan MESTI kekal 1 muka surat sahaja
      // (keputusan tetap - tiada doc.addPage() dibenarkan lagi dalam fungsi
      // ini). Sebelum ini, kandungan panjang (Aktiviti/Refleksi panjang,
      // atau ramai Guru Penasihat kerana kini disenaraikan satu nama
      // sebaris) boleh tolak grid gambar ke muka surat ke-2. Baiki: cuba
      // beberapa saiz fon (besar -> kecil) untuk bahagian teks, kira tinggi
      // SEBENAR diperlukan pada setiap saiz (fon lebih kecil = lebih
      // sedikit baris terbalut oleh splitTextToSize), dan guna saiz fon
      // PALING BESAR yang masih tinggalkan ruang munasabah untuk grid
      // gambar 2x2. Jika kandungan amat panjang (jarang berlaku), fon &
      // gambar mengecil ke had minimum - tetap 1 muka surat, tidak pernah 2.
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const leftMargin = 14;
      const valueX = 60;
      const valueWidth = pageWidth - valueX - leftMargin;
      const bottomMargin = 15;
      const labelHeight = 5;
      const rowGap = 5;
      const colGap = 6;
      const availableHeight = pageHeight - bottomMargin - yStart;

      const FONT_SIZE_STEPS = [10, 9, 8, 7, 6];
      const MIN_IMG_SIZE = 18; // had minimum mutlak - gambar tetap dilukis (tidak digugurkan), sekadar kecil
      const MAX_IMG_SIZE = 70;

      const measureRows = (fontSize) => {
        const lineHeight = fontSize * 0.5; // anggaran jarak baris selamat (mm) ikut saiz fon Helvetica
        doc.setFontSize(fontSize);
        let total = 0;
        const measured = rows.map(([label, value]) => {
          const lines = doc.splitTextToSize(String(value || '-'), valueWidth);
          const rowHeight = Math.max(lineHeight + 1, lines.length * lineHeight) + 2;
          total += rowHeight;
          return { label, lines, rowHeight };
        });
        return { measured, total };
      };

      let chosenFontSize = FONT_SIZE_STEPS[0];
      let chosenMeasure = null;
      let chosenImgSize = MAX_IMG_SIZE;

      for (const fontSize of FONT_SIZE_STEPS) {
        const { measured, total } = measureRows(fontSize);
        const idealImgSize = Math.floor((availableHeight - total - labelHeight - rowGap) / 2);
        chosenFontSize = fontSize;
        chosenMeasure = measured;
        chosenImgSize = Math.max(MIN_IMG_SIZE, Math.min(MAX_IMG_SIZE, idealImgSize));
        if (idealImgSize >= MIN_IMG_SIZE) break; // saiz fon ini beri ruang gambar yang munasabah - guna terus
        // jika tidak, teruskan cuba fon lebih kecil; jika ini fon TERKECIL
        // dalam senarai, chosenImgSize di atas kekal sebagai jalan selamat
        // terakhir (mungkin di bawah paras selesa, tetapi tetap 1 muka surat).
      }

      let y = yStart;
      doc.setFontSize(chosenFontSize);
      chosenMeasure.forEach(({ label, lines, rowHeight }) => {
        doc.setFont('helvetica', 'bold');
        doc.text(label + ':', leftMargin, y);
        doc.setFont('helvetica', 'normal');
        doc.text(lines, valueX, y);
        y += rowHeight;
      });

      doc.setFont('helvetica', 'bold');
      doc.text('Gambar Aktiviti:', leftMargin, y);
      y += labelHeight;

      // Tengahkan grid 2x2 gambar secara MENDATAR pada muka surat (bukan
      // rapat ke tepi kiri seperti sebelum ini) - kira semula titik mula X
      // berdasarkan lebar sebenar grid (2 lajur gambar + jurang) berbanding
      // lebar kandungan (antara margin kiri/kanan 14mm).
      const imgSize = chosenImgSize;
      const contentWidth = pageWidth - (leftMargin * 2);
      const gridWidth = (imgSize * 2) + colGap;
      const col1X = leftMargin + Math.max(0, (contentWidth - gridWidth) / 2);
      const col2X = col1X + imgSize + colGap;

      const positions = [[col1X, y], [col2X, y], [col1X, y + imgSize + rowGap], [col2X, y + imgSize + rowGap]];

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
