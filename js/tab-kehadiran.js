/*
  tab-kehadiran.js
  ----------------
  TAB 1 - Rekod Kehadiran.
  Guru pilih Kategori -> Unit -> Minggu -> Tarikh/Masa, sistem papar
  murid ikut tahun, guru tick hadir/tidak, simpan. Buka semula minggu
  yang sudah diisi akan memuatkan semula rekod sedia ada (edit mode).
*/

const TabKehadiran = {
  allStudents: [],        // semua murid dalam unit terpilih (semua tahun)
  attendanceMap: {},      // studentId -> true/false (hadir/tidak)
  activeTahun: 4,
  currentSessionId: null,

  init() {
    Shared.populateKategoriSelect(Utils.el('khKategori'));
    Shared.populateKategoriSelect(Utils.el('khPdfKategori'));
    Shared.populateWeekSelect(Utils.el('khMinggu'), false);
    Shared.populateWeekSelect(Utils.el('khPdfMinggu'), false);
    Utils.el('khTarikh').value = Utils.todayIso();

    Utils.el('khKategori').addEventListener('change', (e) => {
      this.unlockSessionFields(); // tukar kategori = sesi berlainan, buka semula minggu/tarikh/masa
      Shared.populateUnitSelect(Utils.el('khUnit'), e.target.value);
      Shared.populateWeekSelect(Utils.el('khMinggu'), false);
    });
    Shared.populateUnitSelect(Utils.el('khUnit'), Utils.el('khKategori').value);

    Utils.el('khUnit').addEventListener('change', (e) => this.handleUnitChange(e.target.value));

    Utils.el('khPdfKategori').addEventListener('change', (e) => {
      Shared.populateUnitSelect(Utils.el('khPdfUnit'), e.target.value);
      Shared.populateWeekSelect(Utils.el('khPdfMinggu'), false);
    });
    Shared.populateUnitSelect(Utils.el('khPdfUnit'), Utils.el('khPdfKategori').value);

    Utils.el('khPdfUnit').addEventListener('change', (e) => {
      this.refreshMingguIndicators('khPdfMinggu', e.target.value);
    });

    Utils.el('khPaparBtn').addEventListener('click', () => this.loadStudentsForEntry());
    Utils.el('khEditSesiBtn').addEventListener('click', () => this.unlockSessionFields());

    document.querySelectorAll('#khYearTabs .year-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#khYearTabs .year-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeTahun = Number(btn.dataset.tahun);
        this.renderStudentList();
      });
    });

    Utils.el('khTickAllBtn').addEventListener('click', () => {
      this.allStudents
        .filter(s => Number(s.tahun) === this.activeTahun)
        .forEach(s => { this.attendanceMap[s.studentId] = true; });
      this.renderStudentList();
    });

    Utils.el('khSimpanBtn').addEventListener('click', () => this.saveAttendance());

    document.querySelectorAll('input[name="khPdfScope"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const isTertentu = document.querySelector('input[name="khPdfScope"]:checked').value === 'tertentu';
        Utils.el('khPdfMingguField').style.display = isTertentu ? '' : 'none';
      });
    });

    Utils.el('khJanaPdfBtn').addEventListener('click', () => this.generatePdf());
  },

  // Selepas senarai murid untuk sesi (minggu/tarikh/masa) dipaparkan atau
  // disimpan, kunci HANYA medan Minggu/Tarikh/Masa Mula/Masa Tamat, supaya
  // guru tidak tertekan tukar butiran sesi yang sudah disimpan secara tidak
  // sengaja sedangkan sedang menanda kehadiran. Kategori dan Unit KEKAL
  // aktif supaya guru boleh terus tukar ke unit lain untuk hantar kehadiran
  // unit tersebut (setiap unit ada sesi/minggu tersendiri, tidak berkongsi
  // status freeze). Senarai murid dan "Simpan Kehadiran" turut KEKAL aktif.
  lockSessionFields() {
    ['khMinggu', 'khTarikh', 'khMasaMula', 'khMasaTamat'].forEach(id => {
      Utils.el(id).disabled = true;
    });
    Utils.el('khPaparBtn').classList.add('hidden');
    Utils.el('khEditSesiBtn').classList.remove('hidden');
  },

  // Buka semula Minggu/Tarikh/Masa Mula/Masa Tamat - dipanggil sama ada
  // guru klik "Kemaskini Maklumat Sesi" secara manual, ATAU secara automatik
  // apabila Kategori/Unit ditukar (kerana itu bermakna sesi/unit berlainan).
  unlockSessionFields() {
    ['khMinggu', 'khTarikh', 'khMasaMula', 'khMasaTamat'].forEach(id => {
      Utils.el(id).disabled = false;
    });
    Utils.el('khPaparBtn').classList.remove('hidden');
    Utils.el('khEditSesiBtn').classList.add('hidden');
    Utils.el('khStudentCard').classList.add('hidden');
    Utils.el('khSessionHint').textContent = '';
    Utils.el('khSimpanBtn').textContent = 'Simpan Kehadiran';
    this.currentSessionId = null;
    this.allStudents = [];
    this.attendanceMap = {};
  },

  // Tukar Unit = konteks sesi berlainan sepenuhnya. SEBELUM ini, fungsi ini
  // sentiasa buka-kunci (unlock) medan Minggu/Tarikh/Masa tanpa syarat -
  // ini punca bug: jika guru tukar ke unit LAIN, isi & simpan, kemudian
  // kembali ke unit ASAL yang sudah pun ada rekod (cth: Minggu 1 Pengakap),
  // medan tidak freeze semula walaupun rekod itu sedia ada. Baiki: selepas
  // dropdown Minggu disegar semula (dengan tanda ✅), semak sama ada Minggu
  // yang SEDANG dipilih sudah ada rekod untuk unit baharu ini - jika ya,
  // muatkan & kunci semula secara automatik (macam guru klik "Papar Senarai
  // Murid" sendiri); jika tidak, baru buka medan untuk kemasukan baharu.
  async handleUnitChange(unitId) {
    const weeks = await this.refreshMingguIndicators('khMinggu', unitId);
    if (!unitId) { this.unlockSessionFields(); return; }

    const selectedMinggu = Utils.el('khMinggu').value;
    const existing = weeks.find(w => String(w.minggu) === String(selectedMinggu));

    if (existing && existing.available) {
      // Pastikan medan aktif dahulu supaya loadStudentsForEntry() boleh
      // baca/isi nilainya; nilai placeholder Masa (jika kosong) akan
      // ditimpa serta-merta oleh rekod sedia ada yang dimuatkan.
      ['khMinggu', 'khTarikh', 'khMasaMula', 'khMasaTamat'].forEach(id => { Utils.el(id).disabled = false; });
      if (!Utils.el('khMasaMula').value) Utils.el('khMasaMula').value = '00:00';
      if (!Utils.el('khMasaTamat').value) Utils.el('khMasaTamat').value = '00:00';
      await this.loadStudentsForEntry();
    } else {
      this.unlockSessionFields();
    }
  },

  // Tandakan minggu yang SUDAH mempunyai rekod kehadiran dengan ikon ✅ dalam
  // dropdown Minggu, supaya guru nampak dengan jelas minggu mana yang sudah
  // diisi (merangkumi Tahun 4/5/6 sekali, kerana satu sesi kehadiran meliputi
  // semua murid unit tersebut, bukan diasingkan ikut tahun).
  async refreshMingguIndicators(selectId, unitId) {
    const select = Utils.el(selectId);
    if (!unitId) { Shared.populateWeekSelect(select, selectId === 'khPdfMinggu'); return []; }

    const previousValue = select.value;
    try {
      const weeks = await Api.call('getWeeksWithSession', { unitId, academicYear: Shared.academicYear });
      select.innerHTML = '';
      if (selectId === 'khPdfMinggu') {
        const opt = document.createElement('option');
        opt.value = ''; opt.textContent = 'Semua Minggu';
        select.appendChild(opt);
      }
      weeks.forEach(w => {
        const opt = document.createElement('option');
        opt.value = w.minggu;
        opt.textContent = w.available ? `Minggu ${w.minggu} ✅` : `Minggu ${w.minggu}`;
        select.appendChild(opt);
      });
      if (previousValue) select.value = previousValue;
      return weeks;
    } catch (err) {
      // Senyap - biar guru tetap boleh pilih minggu secara manual walaupun status tidak dapat dimuat
      Shared.populateWeekSelect(select, selectId === 'khPdfMinggu');
      return [];
    }
  },

  async loadStudentsForEntry() {
    const unitId = Utils.el('khUnit').value;
    const minggu = Utils.el('khMinggu').value;
    const tarikh = Utils.el('khTarikh').value;
    const masaMula = Utils.el('khMasaMula').value;
    const masaTamat = Utils.el('khMasaTamat').value;

    if (!unitId) return Utils.toast('Sila pilih Unit terlebih dahulu.', 'error');
    if (!minggu) return Utils.toast('Sila pilih Minggu.', 'error');
    if (!tarikh || !masaMula || !masaTamat) return Utils.toast('Sila lengkapkan Tarikh, Masa Mula dan Masa Tamat.', 'error');

    try {
      Utils.showLoading('Memuatkan senarai murid...');
      const data = await Api.call('getAttendanceEntryData', {
        unitId, minggu, academicYear: Shared.academicYear
      });

      this.allStudents = data.students || [];
      this.attendanceMap = {};
      this.currentSessionId = data.session ? data.session.sessionId : null;

      if (data.session) {
        Utils.el('khTarikh').value = data.session.tarikh || tarikh;
        Utils.el('khMasaMula').value = data.session.masaMula || masaMula;
        Utils.el('khMasaTamat').value = data.session.masaTamat || masaTamat;
        Utils.el('khSessionHint').textContent = 'Rekod sedia ada untuk minggu ini dimuatkan - anda sedang mengemaskini.';
        Utils.el('khSimpanBtn').textContent = 'Kemaskini Kehadiran';
      } else {
        Utils.el('khSessionHint').textContent = 'Rekod baharu akan dicipta untuk minggu ini.';
        Utils.el('khSimpanBtn').textContent = 'Simpan Kehadiran';
      }
      const alreadyFilled = !!data.session; // "diisi" = rekod SUDAH wujud (bukan sekadar dipapar)

      (data.records || []).forEach(r => {
        this.attendanceMap[r.studentId] = r.statusKehadiran === 'Hadir';
      });

      if (this.allStudents.length === 0) {
        Utils.toast('Tiada murid didaftarkan dalam unit ini. Sila daftarkan murid di Tab Admin.', 'error', 5000);
      }

      Utils.el('khStudentCard').classList.remove('hidden');
      this.activeTahun = 4;
      document.querySelectorAll('#khYearTabs .year-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('#khYearTabs .year-btn[data-tahun="4"]').classList.add('active');
      this.renderStudentList();
      // PENTING: kunci medan HANYA jika minggu ini SUDAH ada rekod tersimpan
      // (guru membuka semula minggu yang sedia ada). Jika ini minggu BAHARU
      // (belum pernah diisi/disimpan), medan KEKAL boleh edit sehingga guru
      // benar-benar klik Simpan - baru dikunci (lihat saveAttendance()).
      // Sebelum ini fungsi dikunci serta-merta selepas klik "Papar Senarai
      // Murid" walaupun minggu itu masih kosong - punca bug dilaporkan guru.
      if (alreadyFilled) this.lockSessionFields();

    } catch (err) {
      Utils.toast(Utils.friendlyError(err), 'error');
    } finally {
      Utils.hideLoading();
    }
  },

  renderStudentList() {
    const container = Utils.el('khStudentList');
    const list = this.allStudents.filter(s => Number(s.tahun) === this.activeTahun);
    Utils.el('khStudentCount').textContent = `${list.length} murid`;

    if (list.length === 0) {
      container.innerHTML = '<p class="hint-text">Tiada murid Tahun ' + this.activeTahun + ' dalam unit ini.</p>';
      return;
    }

    container.innerHTML = list.map(s => {
      const checked = !!this.attendanceMap[s.studentId];
      return `
        <label class="student-row ${checked ? 'checked' : ''}" data-student-id="${s.studentId}">
          <input type="checkbox" ${checked ? 'checked' : ''}>
          <span class="student-name">${Utils.escapeHtml(s.nama)}</span>
          <span class="student-meta">${Utils.escapeHtml(s.kelas || '')}</span>
        </label>`;
    }).join('');

    container.querySelectorAll('.student-row').forEach(row => {
      const checkbox = row.querySelector('input[type="checkbox"]');
      row.addEventListener('click', (e) => {
        if (e.target.tagName !== 'INPUT') checkbox.checked = !checkbox.checked;
        const studentId = row.dataset.studentId;
        this.attendanceMap[studentId] = checkbox.checked;
        row.classList.toggle('checked', checkbox.checked);
      });
    });
  },

  async saveAttendance() {
    const unitId = Utils.el('khUnit').value;
    const kategori = Utils.el('khKategori').value;
    const minggu = Utils.el('khMinggu').value;

    if (this.allStudents.length === 0) {
      return Utils.toast('Tiada murid untuk disimpan. Sila papar senarai murid dahulu.', 'error');
    }

    const records = this.allStudents.map(s => ({
      studentId: s.studentId,
      statusKehadiran: this.attendanceMap[s.studentId] ? 'Hadir' : 'Tidak Hadir'
    }));

    const payload = {
      sessionId: this.currentSessionId,
      unitId, kategori, minggu,
      tarikh: Utils.el('khTarikh').value,
      masaMula: Utils.el('khMasaMula').value,
      masaTamat: Utils.el('khMasaTamat').value,
      academicYear: Shared.academicYear,
      records
    };

    try {
      Utils.showLoading('Menyimpan kehadiran...');
      const result = await Api.call('saveAttendanceSession', payload);
      this.currentSessionId = result.sessionId;
      Utils.el('khSessionHint').textContent = 'Rekod telah disimpan. Anda boleh kemaskini semula bila-bila masa.';
      Utils.el('khSimpanBtn').textContent = 'Kemaskini Kehadiran';
      Utils.toast('Kehadiran berjaya disimpan.', 'success');
      this.refreshMingguIndicators('khMinggu', unitId); // papar ✅ serta-merta untuk minggu ini
      this.lockSessionFields();
    } catch (err) {
      Utils.toast(Utils.friendlyError(err), 'error');
    } finally {
      Utils.hideLoading();
    }
  },

  async generatePdf() {
    const unitId = Utils.el('khPdfUnit').value;
    const scope = document.querySelector('input[name="khPdfScope"]:checked').value;
    const minggu = scope === 'tertentu' ? Utils.el('khPdfMinggu').value : null;

    if (!unitId) return Utils.toast('Sila pilih Unit untuk PDF.', 'error');

    try {
      Utils.showLoading('Menjana PDF Kehadiran...');
      const data = await Api.call('getAttendanceForPdf', { unitId, academicYear: Shared.academicYear, minggu });

      if (!data.sessions || data.sessions.length === 0) {
        Utils.toast('Tiada rekod kehadiran untuk dijana.', 'error');
        return;
      }

      const doc = PdfHelper.newDoc();
      let y = await PdfHelper.drawHeader(doc, ['REKOD KEHADIRAN', `${data.unitNama} (${data.kategori})`]);

      // Lukis semula tajuk minggu + legenda + header lajur - dipanggil semula
      // pada setiap muka surat sambungan supaya senarai murid yang panjang
      // (unit besar) tidak kehilangan konteks bila ia melimpah ke halaman baharu.
      const drawSessionHeader = (session, isContinuation) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        const label = `MINGGU ${session.minggu}  |  Tarikh: ${Utils.formatDateDisplay(session.tarikh)}` + (isContinuation ? '  (samb.)' : '');
        doc.text(label, 14, y);
        y += 7;

        doc.setFontSize(9);
        doc.text('Simbol: / = HADIR   X = TIDAK HADIR', 14, y);
        y += 6;

        doc.setFont('helvetica', 'bold');
        doc.text('BIL', 14, y);
        doc.text('NAMA MURID', 24, y);
        doc.text('TAHUN', 130, y);
        doc.text('STATUS', 160, y);
        y += 2;
        doc.line(14, y, 196, y);
        y += 5;
        doc.setFont('helvetica', 'normal');
      };

      data.sessions.forEach((session, idx) => {
        if (idx > 0) { doc.addPage(); y = 20; }
        y = PdfHelper.ensureSpace(doc, y, 30);
        drawSessionHeader(session, false);

        session.records.forEach((rec, i) => {
          const pageHeight = doc.internal.pageSize.getHeight();
          if (y + 7 > pageHeight - 15) {
            doc.addPage();
            y = 20;
            drawSessionHeader(session, true);
          }
          doc.text(String(i + 1), 14, y);
          doc.text(String(rec.nama).substring(0, 45), 24, y);
          doc.text(String(rec.tahun), 132, y);
          doc.text(rec.statusKehadiran === 'Hadir' ? '/' : 'X', 165, y);
          y += 6;
        });
      });

      PdfHelper.drawFooter(doc);
      doc.save(`Kehadiran_${data.unitNama}_${Shared.academicYear}.pdf`);

    } catch (err) {
      Utils.toast(Utils.friendlyError(err), 'error');
    } finally {
      Utils.hideLoading();
    }
  }
};
