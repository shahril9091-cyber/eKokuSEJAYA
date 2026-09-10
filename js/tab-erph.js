/*
  tab-erph.js
  -----------
  TAB 2 - eRPH Kokurikulum.
  Minggu hanya boleh dipilih jika Tab 1 (Kehadiran) sudah mempunyai
  rekod untuk minggu tersebut. Bilangan murid auto-link daripada
  rekod kehadiran (tidak ditaip manual).

  Selepas eRPH disimpan, borang bertukar ke MOD LIHAT (medan dikunci,
  butang "Kemaskini" & "Padam" dipaparkan) - elak guru tidak sengaja
  mengubah data yang sudah sah tanpa sedar. Tekan "Kemaskini" untuk buka
  semula medan isian.
*/

const TabErph = {
  currentSessionId: null,
  currentUnitId: null,
  currentMinggu: null,
  isEditable: true, // false = mod lihat (selepas disimpan)

  init() {
    Shared.populateKategoriSelect(Utils.el('erKategori'));
    Utils.el('erKategori').addEventListener('change', (e) => {
      Shared.populateUnitSelect(Utils.el('erUnit'), e.target.value);
      Utils.el('erFormCard').classList.add('hidden');
      Utils.el('erWeekChips').innerHTML = '';
    });
    Shared.populateUnitSelect(Utils.el('erUnit'), Utils.el('erKategori').value);

    Utils.el('erUnit').addEventListener('change', (e) => {
      if (e.target.value) this.loadWeekChips(e.target.value);
    });

    this.renderSivikOptions('');
    Utils.el('erSivikSearch').addEventListener('input', (e) => this.renderSivikOptions(e.target.value));

    Utils.el('erSimpanBtn').addEventListener('click', () => this.saveErph());
    Utils.el('erEditBtn').addEventListener('click', () => this.setMode(true));
    Utils.el('erDeleteBtn').addEventListener('click', () => this.deleteErph());
    Utils.el('erJanaPdfBtn').addEventListener('click', () => this.generatePdf());
  },

  // ---- Togol antara MOD ISI (editable) dan MOD LIHAT (selepas simpan) ----
  setMode(editable) {
    this.isEditable = editable;
    ['erTarikh', 'erTajuk', 'erObjektif', 'erAktiviti', 'erRumusan', 'erSivikSearch', 'erSivik'].forEach(id => {
      Utils.el(id).disabled = !editable;
    });
    Utils.el('erSimpanBtn').classList.toggle('hidden', !editable);
    Utils.el('erEditBtn').classList.toggle('hidden', editable);
    Utils.el('erDeleteBtn').classList.toggle('hidden', editable);
  },

  renderSivikOptions(filter) {
    const select = Utils.el('erSivik');
    const previousValue = select.value;
    const source = Shared.sivikList || CONFIG.SIVIK_LIST;
    const filtered = source.filter(s => !filter || s.toUpperCase().includes(filter.toUpperCase()));

    // Kekalkan pilihan sedia ada dalam senarai walaupun ia tidak sepadan carian
    // semasa - jika tidak, menaip carian akan SENYAP membatalkan pilihan Sivik
    // yang guru sudah buat sebelum ini, tanpa sebarang amaran.
    if (previousValue && !filtered.includes(previousValue)) {
      filtered.unshift(previousValue);
    }

    select.innerHTML = '';
    filtered.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      select.appendChild(opt);
    });
    if (previousValue) select.value = previousValue;
  },

  // Muatkan status DAN data eRPH bagi SEMUA 12 minggu sekaligus (satu
  // panggilan sahaja) - klik minggu selepas ini (showErphForm) terus baca
  // daripada senarai yang sudah dimuatkan, tanpa round-trip server lagi.
  async loadWeekChips(unitId) {
    this.currentUnitId = unitId;
    try {
      Utils.showLoading('Memuatkan data eRPH unit ini...');
      const weeks = await Api.call('getErphWeeksData', { unitId, academicYear: Shared.academicYear });
      this.weeksData = weeks;
      this.weekChipsByMinggu = {};
      const container = Utils.el('erWeekChips');
      container.innerHTML = '';

      weeks.forEach(w => {
        const chip = document.createElement('button');
        chip.className = 'week-chip ' + (w.available ? 'available' : 'disabled');
        chip.textContent = `MINGGU ${w.minggu}` + (w.erph ? ' ✅' : '');
        chip.addEventListener('click', () => {
          if (!w.available) {
            Utils.el('erWeekHint').textContent = 'Tiada rekod kehadiran untuk minggu ini. Sila lengkapkan Rekod Kehadiran terlebih dahulu.';
            Utils.el('erFormCard').classList.add('hidden');
            return;
          }
          container.querySelectorAll('.week-chip').forEach(c => c.classList.remove('selected'));
          chip.classList.add('selected');
          this.showErphForm(w);
        });
        container.appendChild(chip);
        this.weekChipsByMinggu[w.minggu] = chip;
      });

      Utils.el('erWeekHint').textContent = weeks.some(w => w.available)
        ? 'Pilih minggu (hijau) untuk isi eRPH.'
        : 'Tiada rekod kehadiran untuk minggu ini. Sila lengkapkan Rekod Kehadiran terlebih dahulu.';

    } catch (err) {
      Utils.toast(Utils.friendlyError(err), 'error');
    } finally {
      Utils.hideLoading();
    }
  },

  // Papar borang eRPH bagi satu minggu - data sudah ada dalam this.weeksData
  // (dimuatkan sekali oleh loadWeekChips), jadi tiada panggilan server di sini.
  showErphForm(w) {
    this.currentMinggu = w.minggu;
    this.currentSessionId = w.sessionId;

    Utils.el('erMingguDisplay').value = `Minggu ${w.minggu}`;
    Utils.el('erBilanganMurid').value = w.bilanganMurid;

    const erph = w.erph || {};
    Utils.el('erTarikh').value = Utils.toDateInputValue(erph.tarikh) || Utils.todayIso();
    Utils.el('erTajuk').value = erph.tajukAktiviti || '';
    Utils.el('erObjektif').value = erph.objektif || '';
    Utils.el('erAktiviti').value = erph.aktiviti || '';
    Utils.el('erRumusan').value = erph.rumusan || '';
    Utils.el('erSivikSearch').value = '';
    this.renderSivikOptions('');
    if (erph.sivik) Utils.el('erSivik').value = erph.sivik;

    Utils.el('erFormCard').classList.remove('hidden');
    // Jika eRPH sudah wujud untuk minggu ini, buka dalam mod lihat (terkunci);
    // jika belum, buka terus dalam mod isi.
    this.setMode(!w.erph);
  },

  // Segerakkan this.weeksData + tanda ✅ pada chip selepas simpan/padam,
  // supaya guru boleh tukar minggu lain dalam unit yang sama tanpa perlu
  // muat semula (loadWeekChips) untuk lihat status terkini.
  updateLocalWeekData_(minggu, erph) {
    const w = (this.weeksData || []).find(x => x.minggu === minggu);
    if (w) w.erph = erph;
    const chip = (this.weekChipsByMinggu || {})[minggu];
    if (chip) chip.textContent = `MINGGU ${minggu}` + (erph ? ' ✅' : '');
  },

  async saveErph() {
    const tajuk = Utils.el('erTajuk').value.trim();
    const sivik = Utils.el('erSivik').value;

    if (!tajuk) return Utils.toast('Sila isi Tajuk Aktiviti.', 'error');
    if (!sivik) return Utils.toast('Sila pilih Sivik.', 'error');

    const payload = {
      sessionId: this.currentSessionId,
      unitId: this.currentUnitId,
      minggu: this.currentMinggu,
      academicYear: Shared.academicYear,
      tarikh: Utils.el('erTarikh').value,
      bilanganMurid: Utils.el('erBilanganMurid').value,
      tajukAktiviti: tajuk,
      objektif: Utils.el('erObjektif').value.trim(),
      aktiviti: Utils.el('erAktiviti').value.trim(),
      rumusan: Utils.el('erRumusan').value.trim(),
      sivik
    };

    try {
      Utils.showLoading('Menyimpan eRPH...');
      await Api.call('saveERPH', payload);
      Utils.toast('eRPH berjaya disimpan.', 'success');
      this.updateLocalWeekData_(this.currentMinggu, payload);
      this.setMode(false);
    } catch (err) {
      Utils.toast(Utils.friendlyError(err), 'error');
    } finally {
      Utils.hideLoading();
    }
  },

  async deleteErph() {
    if (!this.currentSessionId) return;
    const ok = await Utils.confirmModal(
      `Padam eRPH bagi Minggu ${this.currentMinggu}? Minggu ini akan kembali ke keadaan belum diisi.`,
      'Sahkan Padam eRPH'
    );
    if (!ok) return;

    try {
      Utils.showLoading('Memadam eRPH...');
      await Api.call('deleteERPH', { sessionId: this.currentSessionId });
      Utils.toast('eRPH berjaya dipadam.', 'success');
      this.updateLocalWeekData_(this.currentMinggu, null);

      Utils.el('erTarikh').value = Utils.todayIso();
      Utils.el('erTajuk').value = '';
      Utils.el('erObjektif').value = '';
      Utils.el('erAktiviti').value = '';
      Utils.el('erRumusan').value = '';
      Utils.el('erSivikSearch').value = '';
      this.renderSivikOptions('');
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
      Utils.showLoading('Menjana PDF eRPH...');
      const unit = Shared.getUnitById(this.currentUnitId);
      const doc = PdfHelper.newDoc();
      let y = await PdfHelper.drawHeader(doc, ['eRPH KOKURIKULUM', `${unit ? unit.namaUnit : ''} - MINGGU ${this.currentMinggu}`]);

      const rows = [
        ['Tarikh', Utils.formatDateDisplay(Utils.el('erTarikh').value)],
        ['Bilangan Murid', Utils.el('erBilanganMurid').value],
        ['Tajuk Aktiviti', Utils.el('erTajuk').value],
        ['Objektif', Utils.el('erObjektif').value],
        ['Aktiviti', Utils.el('erAktiviti').value],
        ['Rumusan', Utils.el('erRumusan').value],
        ['Sivik', Utils.el('erSivik').value]
      ];

      doc.setFont('helvetica', 'normal');
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

      PdfHelper.drawFooter(doc);
      doc.save(`eRPH_${unit ? unit.namaUnit : 'Unit'}_Minggu${this.currentMinggu}.pdf`);
    } catch (err) {
      Utils.toast(Utils.friendlyError(err), 'error');
    } finally {
      Utils.hideLoading();
    }
  }
};
