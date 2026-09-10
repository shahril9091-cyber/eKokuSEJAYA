/*
  tab-admin.js
  ------------
  TAB 5 - Admin.
  Mengandungi: log masuk admin, urus tahun akademik, daftar murid/guru/unit
  (satu-satu & pukal), penempatan murid ke unit, edit/padam data,
  migrasi data tahun sebelumnya, dan urus master data Sivik/PPikeBM.

  Nota keselamatan: kata laluan TIDAK disemak di sini. Frontend hanya
  menghantar kata laluan ke Google Apps Script (adminLogin) dan backend
  yang mengesahkannya lalu memulangkan token session.
*/

const TabAdmin = {
  isLoggedIn: false,
  bulkStudentRows: [],
  bulkTeacherRows: [],
  migrationPreviewData: null,

  init() {
    this.checkExistingSession();

    Utils.el('adminLoginBtn').addEventListener('click', () => this.login());
    Utils.el('adminLogoutBtn').addEventListener('click', () => this.logout());
    Utils.el('adminSetYearBtn').addEventListener('click', () => this.setAcademicYear());

    Utils.el('stuAddBtn').addEventListener('click', () => this.addStudent());
    Utils.el('stuBulkPreviewBtn').addEventListener('click', () => this.previewBulkStudents());
    Utils.el('stuBulkConfirmBtn').addEventListener('click', () => this.confirmBulkStudents());
    Utils.el('stuSearchInput').addEventListener('input', () => this.renderStudentTable());

    Utils.el('tchAddBtn').addEventListener('click', () => this.addTeacher());
    Utils.el('tchBulkPreviewBtn').addEventListener('click', () => this.previewBulkTeachers());
    Utils.el('tchBulkConfirmBtn').addEventListener('click', () => this.confirmBulkTeachers());

    Shared.populateKategoriSelect(Utils.el('unitKategori'));
    Utils.el('unitAddBtn').addEventListener('click', () => this.addUnit());

    Utils.el('placeUnitSelect').addEventListener('change', () => this.loadPlacementList());
    Utils.el('placeSearchInput').addEventListener('input', () => this.renderPlacementList());
    Utils.el('placeTahunFilter').addEventListener('change', () => this.renderPlacementList());
    Utils.el('placeTickAllBtn').addEventListener('click', () => this.tickAllVisiblePlacement());
    Utils.el('placeSubmitBtn').addEventListener('click', () => this.assignStudents());

    Utils.el('placeTeacherUnitSelect').addEventListener('change', () => this.loadTeacherPlacementList());
    Utils.el('placeTeacherSearchInput').addEventListener('input', () => this.renderTeacherPlacementList());
    Utils.el('placeTeacherTickAllBtn').addEventListener('click', () => this.tickAllVisibleTeacherPlacement());
    Utils.el('placeTeacherSubmitBtn').addEventListener('click', () => this.assignTeachers());

    Utils.el('migCheckBtn').addEventListener('click', () => this.previewMigration());
    Utils.el('migConfirmBtn').addEventListener('click', () => this.executeMigration());

    Utils.el('masterSaveBtn').addEventListener('click', () => this.saveMasterLists());

    Utils.el('dangerDeleteRecordsBtn').addEventListener('click', () => this.dangerDeleteRecords());
    Utils.el('dangerDeleteAllBtn').addEventListener('click', () => this.dangerDeleteAll());
  },

  checkExistingSession() {
    const token = sessionStorage.getItem(CONFIG.ADMIN_SESSION_KEY);
    if (token) {
      this.isLoggedIn = true;
      this.showAdminContent();
    }
  },

  async login() {
    const password = Utils.el('adminPasswordInput').value;
    if (!password) return;
    try {
      Utils.showLoading('Mengesahkan...');
      const result = await Api.call('adminLogin', { password });
      sessionStorage.setItem(CONFIG.ADMIN_SESSION_KEY, result.token);
      this.isLoggedIn = true;
      Utils.el('adminLoginError').classList.add('hidden');
      this.showAdminContent();
      if (result.isDefaultPassword) {
        Utils.toast('Amaran: Anda masih menggunakan kata laluan lalai. Sila tukar segera di Apps Script Editor (fungsi setAdminPassword).', 'error', 10000);
      }
    } catch (err) {
      Utils.el('adminLoginError').textContent = 'Kata laluan salah. Sila cuba lagi.';
      Utils.el('adminLoginError').classList.remove('hidden');
    } finally {
      Utils.hideLoading();
    }
  },

  logout() {
    sessionStorage.removeItem(CONFIG.ADMIN_SESSION_KEY);
    this.isLoggedIn = false;
    Utils.el('adminLoginCard').classList.remove('hidden');
    Utils.el('adminContentArea').classList.add('hidden');
    Utils.el('adminPasswordInput').value = '';
  },

  async showAdminContent() {
    Utils.el('adminLoginCard').classList.add('hidden');
    Utils.el('adminContentArea').classList.remove('hidden');
    Utils.el('adminYearInfo').textContent = `Tahun Semasa: ${Shared.academicYear}`;
    Utils.el('adminSetYearInput').value = Shared.academicYear;
    Utils.el('dangerYearLabel').textContent = Shared.academicYear;

    Shared.populateAllUnitsSelect(Utils.el('placeUnitSelect'));
    Shared.populateAllUnitsSelect(Utils.el('placeTeacherUnitSelect'));

    await Promise.all([
      this.renderStudentTable(true),
      this.renderTeacherTable(true),
      this.renderUnitTable(true),
      this.loadMasterLists()
    ]);
  },

  // ==================== TAHUN AKADEMIK ====================
  async setAcademicYear() {
    const year = Utils.el('adminSetYearInput').value;
    if (!year) return Utils.toast('Sila masukkan tahun akademik.', 'error');

    const ok = await Utils.confirmModal(`Tukar tahun sistem semasa kepada ${year}? Semua tab akan beroperasi atas tahun ini.`, 'Tukar Tahun Akademik');
    if (!ok) return;

    try {
      Utils.showLoading('Mengemaskini tahun akademik...');
      await Api.call('setCurrentAcademicYear', { year }, true);
      Shared.academicYear = String(year);
      Utils.el('academicYearBadge').textContent = `Tahun: ${Shared.academicYear}`;
      Utils.el('adminYearInfo').textContent = `Tahun Semasa: ${Shared.academicYear}`;
      Utils.el('dangerYearLabel').textContent = Shared.academicYear;
      await Shared.refreshUnits();
      await Shared.refreshTeachers();
      Utils.toast('Tahun akademik berjaya dikemaskini.', 'success');
    } catch (err) {
      Utils.toast(Utils.friendlyError(err), 'error');
    } finally {
      Utils.hideLoading();
    }
  },

  // ==================== MURID ====================
  // Kesan tahun daripada nama kelas di sisi client (untuk preview sahaja -
  // pengesahan sebenar dibuat semula di backend). Cermin logik deriveTahunFromKelas_ di Students.gs.
  guessTahunFromKelas(kelas) {
    const match = String(kelas).match(/[456]/);
    return match ? match[0] : null;
  },

  async addStudent() {
    const nama = Utils.el('stuNama').value.trim();
    const kelas = Utils.el('stuKelas').value.trim();
    if (!nama || !kelas) return Utils.toast('Nama dan Kelas murid wajib diisi.', 'error');
    if (!this.guessTahunFromKelas(kelas)) {
      return Utils.toast('Nama kelas mesti mengandungi angka tahun 4, 5, atau 6 (cth: "4 Alpha").', 'error');
    }

    const data = { nama, kelas, academicYear: Shared.academicYear };

    try {
      Utils.showLoading('Menyimpan murid...');
      await Api.call('saveStudent', data, true);
      Utils.toast('Murid berjaya didaftarkan.', 'success');
      Utils.el('stuNama').value = ''; Utils.el('stuKelas').value = '';
      await this.renderStudentTable(true);
    } catch (err) {
      Utils.toast(Utils.friendlyError(err), 'error');
    } finally {
      Utils.hideLoading();
    }
  },

  previewBulkStudents() {
    const raw = Utils.el('stuBulkText').value;
    const rows = Utils.parseBulkPaste(raw);
    this.bulkStudentRows = rows.map(r => ({
      nama: r[0] || '', kelas: r[1] || ''
    })).filter(r => r.nama || r.kelas);

    if (this.bulkStudentRows.length === 0) {
      return Utils.toast('Tiada data sah dikesan. Semak format data anda.', 'error');
    }

    const table = Utils.el('stuBulkPreviewTable');
    table.innerHTML = '<thead><tr><th>Nama</th><th>Kelas</th><th>Tahun (dikesan)</th></tr></thead><tbody>' +
      this.bulkStudentRows.map(r => {
        const tahun = this.guessTahunFromKelas(r.kelas);
        const tahunCell = tahun ? tahun : '<span class="error-text" style="margin:0;">Tidak dikesan</span>';
        return `<tr><td>${Utils.escapeHtml(r.nama)}</td><td>${Utils.escapeHtml(r.kelas)}</td><td>${tahunCell}</td></tr>`;
      }).join('') +
      '</tbody>';
    Utils.el('stuBulkPreviewArea').classList.remove('hidden');
  },

  async confirmBulkStudents() {
    try {
      Utils.showLoading('Menyimpan murid secara pukal...');
      const result = await Api.call('bulkSaveStudents', { rows: this.bulkStudentRows, academicYear: Shared.academicYear }, true);
      Utils.toast(`${result.added} murid berjaya ditambah. ${result.skipped.length} dilangkau (duplicate/ralat).`, 'success', 5000);
      Utils.el('stuBulkText').value = '';
      Utils.el('stuBulkPreviewArea').classList.add('hidden');
      await this.renderStudentTable(true);
    } catch (err) {
      Utils.toast(Utils.friendlyError(err), 'error');
    } finally {
      Utils.hideLoading();
    }
  },

  async renderStudentTable(refetch) {
    if (refetch || !this._studentCache) {
      const [students, placements] = await Promise.all([
        Api.call('getStudents', { academicYear: Shared.academicYear }),
        Api.call('getAllPlacements', { academicYear: Shared.academicYear })
      ]);

      // Bina peta studentId -> nama unit setiap kategori, supaya guru boleh
      // terus lihat unit/kelab/sukan mana seseorang murid sudah didaftarkan
      // tanpa perlu semak satu-satu skrin Penempatan Murid.
      const unitByStudent = {};
      placements.forEach(p => {
        if (!unitByStudent[p.studentId]) unitByStudent[p.studentId] = {};
        unitByStudent[p.studentId][p.kategori] = p.unitId;
      });

      this._studentCache = students.map(s => {
        const m = unitByStudent[s.studentId] || {};
        return Object.assign({}, s, {
          unitBeruniformId: m['UNIT BERUNIFORM'] || '',
          kelabPersatuanId: m['KELAB / PERSATUAN'] || '',
          sukanPermainanId: m['SUKAN / PERMAINAN'] || ''
        });
      });
    }

    const search = (Utils.el('stuSearchInput').value || '').toUpperCase();
    const rows = this._studentCache.filter(s =>
      !search || s.nama.toUpperCase().includes(search) || String(s.kelas || '').toUpperCase().includes(search)
    );

    // ID murid sengaja TIDAK dipaparkan di sini (dijana & diurus sistem
    // secara dalaman sahaja). Tahun tidak boleh diedit terus - ia terbitan
    // automatik daripada Kelas (tukar Kelas untuk kemaskini Tahun).
    this.renderAdminTable(Utils.el('stuListTable'), rows,
      [{ key: 'nama', label: 'Nama', editable: true },
       { key: 'kelas', label: 'Kelas', editable: true },
       { key: 'tahun', label: 'Tahun', editable: false },
       this.categoryPlacementColumn('UNIT BERUNIFORM', 'unitBeruniformId', (row, unitId) => this.saveStudentCategoryPlacement(row.studentId, 'UNIT BERUNIFORM', unitId)),
       this.categoryPlacementColumn('KELAB / PERSATUAN', 'kelabPersatuanId', (row, unitId) => this.saveStudentCategoryPlacement(row.studentId, 'KELAB / PERSATUAN', unitId)),
       this.categoryPlacementColumn('SUKAN / PERMAINAN', 'sukanPermainanId', (row, unitId) => this.saveStudentCategoryPlacement(row.studentId, 'SUKAN / PERMAINAN', unitId)),
       { key: 'status', label: 'Status', editable: false }],
      'studentId', 'Students', () => this.renderStudentTable(true), 'stuSimpanSemuaBtn');
  },

  // ---- Lajur dropdown "penempatan pantas" (Unit Beruniform/Kelab/Sukan) -
  // dikongsi antara Senarai Murid Semasa DAN Senarai Guru Semasa. Menukar
  // pilihan TIDAK PERNAH terus disimpan (lihat renderAdminTable) - ia
  // sentiasa ditangguh sehingga butang "Simpan" baris itu ditekan.
  categoryPlacementColumn(kategori, key, onLiveChange) {
    return {
      key: key,
      label: kategori === 'UNIT BERUNIFORM' ? 'Unit Beruniform' : (kategori === 'KELAB / PERSATUAN' ? 'Kelab/Persatuan' : 'Sukan/Permainan'),
      editable: false,
      liveSelectOptions: () => {
        const opts = [{ value: '', label: '-- Tiada --' }];
        Shared.getUnitsByKategori(kategori).forEach(u => opts.push({ value: u.unitId, label: u.namaUnit }));
        return opts;
      },
      // Mutasi TULEN sahaja (tiada loading/toast/refetch) - chrome
      // dikendalikan oleh renderAdminTable apabila "Simpan" ditekan.
      onLiveChange: onLiveChange
    };
  },

  saveStudentCategoryPlacement(studentId, kategori, unitId) {
    return Api.call('setStudentUnitForCategory', { studentId, kategori, unitId, academicYear: Shared.academicYear }, true);
  },

  saveTeacherCategoryPlacement(teacherId, kategori, unitId) {
    return Api.call('setTeacherUnitForCategory', { teacherId, kategori, unitId, academicYear: Shared.academicYear }, true);
  },

  // ==================== GURU ====================
  async addTeacher() {
    const data = { nama: Utils.el('tchNama').value.trim(), academicYear: Shared.academicYear };
    if (!data.nama) return Utils.toast('Nama guru wajib diisi.', 'error');

    try {
      Utils.showLoading('Menyimpan guru...');
      await Api.call('saveTeacher', data, true);
      Utils.toast('Guru berjaya didaftarkan.', 'success');
      Utils.el('tchNama').value = '';
      await Shared.refreshTeachers();
      await this.renderTeacherTable(true);
    } catch (err) {
      Utils.toast(Utils.friendlyError(err), 'error');
    } finally {
      Utils.hideLoading();
    }
  },

  previewBulkTeachers() {
    const raw = Utils.el('tchBulkText').value;
    const rows = Utils.parseBulkPaste(raw);
    this.bulkTeacherRows = rows.map(r => ({ nama: r[0] || '' })).filter(r => r.nama);

    if (this.bulkTeacherRows.length === 0) return Utils.toast('Tiada data sah dikesan.', 'error');

    const table = Utils.el('tchBulkPreviewTable');
    table.innerHTML = '<thead><tr><th>Nama</th></tr></thead><tbody>' +
      this.bulkTeacherRows.map(r => `<tr><td>${Utils.escapeHtml(r.nama)}</td></tr>`).join('') +
      '</tbody>';
    Utils.el('tchBulkPreviewArea').classList.remove('hidden');
  },

  async confirmBulkTeachers() {
    try {
      Utils.showLoading('Menyimpan guru secara pukal...');
      const result = await Api.call('bulkSaveTeachers', { rows: this.bulkTeacherRows, academicYear: Shared.academicYear }, true);
      Utils.toast(`${result.added} guru berjaya ditambah. ${result.skipped.length} dilangkau.`, 'success', 5000);
      Utils.el('tchBulkText').value = '';
      Utils.el('tchBulkPreviewArea').classList.add('hidden');
      await Shared.refreshTeachers();
      await this.renderTeacherTable(true);
    } catch (err) {
      Utils.toast(Utils.friendlyError(err), 'error');
    } finally {
      Utils.hideLoading();
    }
  },

  async renderTeacherTable(refetch) {
    if (refetch || !this._teacherCache) {
      const [teachers, placements] = await Promise.all([
        Api.call('getTeachers', { academicYear: Shared.academicYear }),
        Api.call('getAllTeacherPlacements', { academicYear: Shared.academicYear })
      ]);

      // Seorang guru boleh membimbing >1 unit - gabungkan sebagai satu senarai
      // (lajur "Unit Dibimbing" penuh, untuk makluman) DAN simpan unit
      // PERTAMA setiap kategori (untuk pra-isi 3 dropdown penempatan pantas
      // di bawah - lihat categoryPlacementColumn/setTeacherUnitForCategory).
      const unitsByTeacher = {};
      const categoryUnitByTeacher = {};
      placements.forEach(p => {
        if (!unitsByTeacher[p.teacherId]) unitsByTeacher[p.teacherId] = [];
        unitsByTeacher[p.teacherId].push(p.unitNama);

        if (!categoryUnitByTeacher[p.teacherId]) categoryUnitByTeacher[p.teacherId] = {};
        if (!categoryUnitByTeacher[p.teacherId][p.kategori]) categoryUnitByTeacher[p.teacherId][p.kategori] = p.unitId;
      });

      this._teacherCache = teachers.map(t => {
        const m = categoryUnitByTeacher[t.teacherId] || {};
        return Object.assign({}, t, {
          unitDibimbing: (unitsByTeacher[t.teacherId] || []).join(', ') || '-',
          unitBeruniformId: m['UNIT BERUNIFORM'] || '',
          kelabPersatuanId: m['KELAB / PERSATUAN'] || '',
          sukanPermainanId: m['SUKAN / PERMAINAN'] || ''
        });
      });
    }
    this.renderAdminTable(Utils.el('tchListTable'), this._teacherCache,
      [{ key: 'nama', label: 'Nama', editable: true },
       { key: 'unitDibimbing', label: 'Unit Dibimbing (Guru Penasihat)', editable: false },
       this.categoryPlacementColumn('UNIT BERUNIFORM', 'unitBeruniformId', (row, unitId) => this.saveTeacherCategoryPlacement(row.teacherId, 'UNIT BERUNIFORM', unitId)),
       this.categoryPlacementColumn('KELAB / PERSATUAN', 'kelabPersatuanId', (row, unitId) => this.saveTeacherCategoryPlacement(row.teacherId, 'KELAB / PERSATUAN', unitId)),
       this.categoryPlacementColumn('SUKAN / PERMAINAN', 'sukanPermainanId', (row, unitId) => this.saveTeacherCategoryPlacement(row.teacherId, 'SUKAN / PERMAINAN', unitId)),
       { key: 'status', label: 'Status', editable: false }],
      'teacherId', 'Teachers', () => this.renderTeacherTable(true), 'tchSimpanSemuaBtn');
  },

  // ==================== UNIT ====================
  async addUnit() {
    const data = {
      namaUnit: Utils.el('unitNama').value.trim(),
      kategori: Utils.el('unitKategori').value,
      academicYear: Shared.academicYear
    };
    if (!data.namaUnit) return Utils.toast('Nama Unit wajib diisi.', 'error');

    try {
      Utils.showLoading('Menyimpan unit...');
      await Api.call('saveUnit', data, true);
      Utils.toast('Unit berjaya didaftarkan.', 'success');
      Utils.el('unitNama').value = '';
      await Shared.refreshUnits();
      Shared.populateAllUnitsSelect(Utils.el('placeUnitSelect'));
      Shared.populateAllUnitsSelect(Utils.el('placeTeacherUnitSelect'));
      await this.renderUnitTable(true);
    } catch (err) {
      Utils.toast(Utils.friendlyError(err), 'error');
    } finally {
      Utils.hideLoading();
    }
  },

  async renderUnitTable(refetch) {
    if (refetch) await Shared.refreshUnits();
    this.renderAdminTable(Utils.el('unitListTable'), Shared.units,
      [{ key: 'namaUnit', label: 'Nama Unit', editable: true },
       { key: 'kategori', label: 'Kategori', editable: false }, { key: 'status', label: 'Status', editable: false }],
      'unitId', 'Units', async () => { await Shared.refreshUnits(); this.renderUnitTable(false); });
  },

  // ==================== PENEMPATAN MURID ====================
  // Guru tidak lagi paste senarai ID - papar senarai murid sebagai checkbox
  // (boleh tapis ikut nama/kelas/tahun), pra-tanda ahli sedia ada unit
  // tersebut. Submit menghantar SENARAI PENUH yang ditanda - backend akan
  // segerak (tambah ahli baharu, kekalkan ahli sedia ada, nyahaktifkan ahli
  // yang tidak lagi ditanda).
  async loadPlacementList() {
    const unitId = Utils.el('placeUnitSelect').value;
    Utils.el('placeResultArea').innerHTML = '';
    if (!unitId) {
      this._placementStudents = null;
      Utils.el('placeStudentList').innerHTML = '<p class="hint-text">Pilih unit di atas untuk papar senarai murid.</p>';
      return;
    }

    try {
      Utils.showLoading('Memuatkan senarai murid...');
      const [allStudents, members, allPlacements] = await Promise.all([
        Api.call('getStudents', { academicYear: Shared.academicYear }),
        Api.call('getUnitMembers', { unitId, academicYear: Shared.academicYear }),
        Api.call('getAllPlacements', { academicYear: Shared.academicYear })
      ]);

      // Seorang murid hanya dibenarkan SATU unit setiap KATEGORI (Unit
      // Beruniform / Kelab-Persatuan / Sukan-Permainan). Murid yang sudah
      // menjadi ahli unit LAIN dalam kategori yang sama disembunyikan
      // terus daripada senarai ini (bukan sekadar tidak ditanda) - mereka
      // tetap akan muncul untuk kategori LAIN yang belum diisi.
      const currentUnit = Shared.getUnitById(unitId);
      const currentKategori = currentUnit ? currentUnit.kategori : '';
      const occupiedElsewhereInCategory = new Set(
        allPlacements
          .filter(p => p.kategori === currentKategori && String(p.unitId) !== String(unitId))
          .map(p => String(p.studentId))
      );

      this._placementStudents = allStudents.filter(s =>
        s.status !== 'Tidak Aktif' && !occupiedElsewhereInCategory.has(String(s.studentId))
      );
      this._placementOriginalMemberIds = new Set(members.map(m => String(m.studentId)));
      // Set "kerja" checkbox semasa - bermula sama dengan ahli sedia ada,
      // tetapi dikemaskini setiap kali guru tick/untick, dan KEKAL walaupun
      // carian/tapisan Tahun ditukar (checkbox murid yang tersembunyi oleh
      // tapisan tidak boleh hilang daripada set ini).
      this._placementCheckedIds = new Set(this._placementOriginalMemberIds);
      this.renderPlacementList();
    } catch (err) {
      Utils.toast(Utils.friendlyError(err), 'error');
    } finally {
      Utils.hideLoading();
    }
  },

  renderPlacementList() {
    const container = Utils.el('placeStudentList');
    if (!this._placementStudents) return;

    const search = (Utils.el('placeSearchInput').value || '').toUpperCase();
    const tahunFilter = Utils.el('placeTahunFilter').value;

    const list = this._placementStudents.filter(s => {
      if (tahunFilter && String(s.tahun) !== tahunFilter) return false;
      if (search && !s.nama.toUpperCase().includes(search) && !String(s.kelas || '').toUpperCase().includes(search)) return false;
      return true;
    });

    Utils.el('placeStudentCount').textContent = `${list.length} murid dipaparkan`;

    if (list.length === 0) {
      container.innerHTML = '<p class="hint-text">Tiada murid sepadan carian.</p>';
      return;
    }

    container.innerHTML = list.map(s => {
      const checked = this._placementCheckedIds.has(String(s.studentId));
      return `
        <label class="student-row ${checked ? 'checked' : ''}" data-student-id="${s.studentId}">
          <input type="checkbox" ${checked ? 'checked' : ''}>
          <span class="student-name">${Utils.escapeHtml(s.nama)}</span>
          <span class="student-meta">Tahun ${Utils.escapeHtml(s.tahun)} - ${Utils.escapeHtml(s.kelas || '')}</span>
        </label>`;
    }).join('');

    container.querySelectorAll('.student-row').forEach(row => {
      const checkbox = row.querySelector('input[type="checkbox"]');
      const studentId = row.dataset.studentId;
      row.addEventListener('click', (e) => {
        if (e.target.tagName !== 'INPUT') checkbox.checked = !checkbox.checked;
        row.classList.toggle('checked', checkbox.checked);
        if (checkbox.checked) this._placementCheckedIds.add(studentId);
        else this._placementCheckedIds.delete(studentId);
      });
    });
  },

  tickAllVisiblePlacement() {
    const container = Utils.el('placeStudentList');
    container.querySelectorAll('.student-row').forEach(row => {
      row.querySelector('input[type="checkbox"]').checked = true;
      row.classList.add('checked');
      this._placementCheckedIds.add(row.dataset.studentId);
    });
  },

  async assignStudents() {
    const unitId = Utils.el('placeUnitSelect').value;
    if (!unitId) return Utils.toast('Sila pilih unit.', 'error');
    if (!this._placementStudents) return Utils.toast('Sila muatkan senarai murid dahulu.', 'error');

    // _placementCheckedIds terkumpul secara berterusan merentasi SEMUA
    // tapisan yang pernah digunakan sejak senarai dimuatkan - tidak perlu
    // baca DOM checkbox terus di sini (elak isu murid tersembunyi tertinggal).
    const checkedIds = this._placementCheckedIds;
    const willRemoveCount = Array.from(this._placementOriginalMemberIds).filter(id => !checkedIds.has(id)).length;
    if (willRemoveCount > 0) {
      const ok = await Utils.confirmModal(
        `${willRemoveCount} murid yang sedia ada dalam unit ini akan DIKELUARKAN kerana tidak lagi ditandakan. Teruskan?`,
        'Sahkan Penempatan'
      );
      if (!ok) return;
    }

    try {
      Utils.showLoading('Menyimpan penempatan murid...');
      const result = await Api.call('assignStudentsToUnit', {
        unitId, studentIds: Array.from(checkedIds), academicYear: Shared.academicYear
      }, true);

      const resultArea = Utils.el('placeResultArea');
      resultArea.innerHTML = `<p class="hint-text">${result.success.length} murid kini ahli aktif unit ini.</p>` +
        (result.failed.length > 0
          ? `<p class="error-text">${result.failed.length} gagal (ID tidak sah): ${result.failed.join(', ')}</p>`
          : '');
      Utils.toast('Penempatan berjaya dikemaskini.', 'success');
      await this.loadPlacementList();
    } catch (err) {
      Utils.toast(Utils.friendlyError(err), 'error');
    } finally {
      Utils.hideLoading();
    }
  },

  // ==================== PENEMPATAN GURU (GURU PENASIHAT) ====================
  // Sama seperti Penempatan Murid, tetapi tiada sekatan "satu kategori satu
  // guru" - seorang guru boleh membimbing beberapa unit sekaligus.
  async loadTeacherPlacementList() {
    const unitId = Utils.el('placeTeacherUnitSelect').value;
    Utils.el('placeTeacherResultArea').innerHTML = '';
    if (!unitId) {
      this._teacherPlacementList = null;
      Utils.el('placeTeacherList').innerHTML = '<p class="hint-text">Pilih unit di atas untuk papar senarai guru.</p>';
      return;
    }

    try {
      Utils.showLoading('Memuatkan senarai guru...');
      const [allTeachers, members] = await Promise.all([
        Api.call('getTeachers', { academicYear: Shared.academicYear }),
        Api.call('getUnitTeacherMembers', { unitId, academicYear: Shared.academicYear })
      ]);
      this._teacherPlacementList = allTeachers.filter(t => t.status !== 'Tidak Aktif');
      this._teacherPlacementOriginalMemberIds = new Set(members.map(m => String(m.teacherId)));
      this._teacherPlacementCheckedIds = new Set(this._teacherPlacementOriginalMemberIds);
      this.renderTeacherPlacementList();
    } catch (err) {
      Utils.toast(Utils.friendlyError(err), 'error');
    } finally {
      Utils.hideLoading();
    }
  },

  renderTeacherPlacementList() {
    const container = Utils.el('placeTeacherList');
    if (!this._teacherPlacementList) return;

    const search = (Utils.el('placeTeacherSearchInput').value || '').toUpperCase();
    const list = this._teacherPlacementList.filter(t => !search || t.nama.toUpperCase().includes(search));

    Utils.el('placeTeacherCount').textContent = `${list.length} guru dipaparkan`;

    if (list.length === 0) {
      container.innerHTML = '<p class="hint-text">Tiada guru sepadan carian.</p>';
      return;
    }

    container.innerHTML = list.map(t => {
      const checked = this._teacherPlacementCheckedIds.has(String(t.teacherId));
      return `
        <label class="student-row ${checked ? 'checked' : ''}" data-teacher-id="${t.teacherId}">
          <input type="checkbox" ${checked ? 'checked' : ''}>
          <span class="student-name">${Utils.escapeHtml(t.nama)}</span>
        </label>`;
    }).join('');

    container.querySelectorAll('.student-row').forEach(row => {
      const checkbox = row.querySelector('input[type="checkbox"]');
      const teacherId = row.dataset.teacherId;
      row.addEventListener('click', (e) => {
        if (e.target.tagName !== 'INPUT') checkbox.checked = !checkbox.checked;
        row.classList.toggle('checked', checkbox.checked);
        if (checkbox.checked) this._teacherPlacementCheckedIds.add(teacherId);
        else this._teacherPlacementCheckedIds.delete(teacherId);
      });
    });
  },

  tickAllVisibleTeacherPlacement() {
    const container = Utils.el('placeTeacherList');
    container.querySelectorAll('.student-row').forEach(row => {
      row.querySelector('input[type="checkbox"]').checked = true;
      row.classList.add('checked');
      this._teacherPlacementCheckedIds.add(row.dataset.teacherId);
    });
  },

  async assignTeachers() {
    const unitId = Utils.el('placeTeacherUnitSelect').value;
    if (!unitId) return Utils.toast('Sila pilih unit.', 'error');
    if (!this._teacherPlacementList) return Utils.toast('Sila muatkan senarai guru dahulu.', 'error');

    const checkedIds = this._teacherPlacementCheckedIds;
    const willRemoveCount = Array.from(this._teacherPlacementOriginalMemberIds).filter(id => !checkedIds.has(id)).length;
    if (willRemoveCount > 0) {
      const ok = await Utils.confirmModal(
        `${willRemoveCount} guru yang sedia ada sebagai penasihat unit ini akan DIKELUARKAN kerana tidak lagi ditandakan. Teruskan?`,
        'Sahkan Penempatan Guru'
      );
      if (!ok) return;
    }

    try {
      Utils.showLoading('Menyimpan penempatan guru...');
      const result = await Api.call('assignTeachersToUnit', {
        unitId, teacherIds: Array.from(checkedIds), academicYear: Shared.academicYear
      }, true);

      const resultArea = Utils.el('placeTeacherResultArea');
      resultArea.innerHTML = `<p class="hint-text">${result.success.length} guru kini penasihat aktif unit ini.</p>` +
        (result.failed.length > 0
          ? `<p class="error-text">${result.failed.length} gagal (ID tidak sah): ${result.failed.join(', ')}</p>`
          : '');
      Utils.toast('Penempatan guru berjaya dikemaskini.', 'success');
      await this.loadTeacherPlacementList();
    } catch (err) {
      Utils.toast(Utils.friendlyError(err), 'error');
    } finally {
      Utils.hideLoading();
    }
  },

  // ==================== MASTER DATA (SIVIK / PPIKEBM) ====================
  async loadMasterLists() {
    Utils.el('masterSivikText').value = (Shared.sivikList || CONFIG.SIVIK_LIST).join('\n');
    Utils.el('masterPPikeBMText').value = (Shared.ppikeBMList || CONFIG.PPIKEBM_LIST).join('\n');
  },

  async saveMasterLists() {
    const sivikList = Utils.el('masterSivikText').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const ppikeBMList = Utils.el('masterPPikeBMText').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

    try {
      Utils.showLoading('Menyimpan master data...');
      await Api.call('updateMasterLists', { sivikList, ppikeBMList }, true);
      Shared.sivikList = sivikList;
      Shared.ppikeBMList = ppikeBMList;
      Utils.toast('Master data berjaya dikemaskini.', 'success');
    } catch (err) {
      Utils.toast(Utils.friendlyError(err), 'error');
    } finally {
      Utils.hideLoading();
    }
  },

  // ==================== MIGRASI ====================
  // "Rekod Kehadiran" ialah satu konsep bagi guru, tetapi tersimpan dalam DUA jadual
  // (AttendanceSessions + AttendanceRecords) di backend - kembangkan pilihan supaya kedua-duanya sertai migrasi.
  expandMigrationCategories(categories) {
    const expanded = [...categories];
    if (expanded.includes('AttendanceSessions') && !expanded.includes('AttendanceRecords')) {
      expanded.push('AttendanceRecords');
    }
    return expanded;
  },

  async previewMigration() {
    const tahunLama = Utils.el('migTahunLama').value;
    const sheetUrl = Utils.el('migSheetUrl').value.trim();
    const categories = this.expandMigrationCategories(
      Array.from(document.querySelectorAll('#migCategoryChecks input:checked')).map(c => c.value)
    );

    if (!tahunLama || !sheetUrl) return Utils.toast('Sila isi Tahun Lama dan URL Google Sheet.', 'error');
    if (categories.length === 0) return Utils.toast('Sila pilih sekurang-kurangnya satu jenis data.', 'error');

    try {
      Utils.showLoading('Membaca Google Sheet lama...');
      const result = await Api.call('previewMigration', { sheetUrl, oldAcademicYear: tahunLama, categories }, true);
      this.migrationPreviewData = { sheetUrl, tahunLama, categories };

      const content = Utils.el('migPreviewContent');
      content.innerHTML = Object.keys(result.counts).map(cat => {
        const info = result.counts[cat];
        if (info.warning) {
          return `<p><strong>${Utils.escapeHtml(cat)}</strong>: <span class="error-text" style="margin:0;">${Utils.escapeHtml(info.warning)}</span></p>`;
        }
        return `<p><strong>${Utils.escapeHtml(cat)}</strong>: ${info.count} rekod dikesan</p>`;
      }).join('') + '<p class="hint-text">Tekan "Sahkan Import" untuk teruskan. Rekod dengan ID yang sudah wujud akan dilangkau secara automatik.</p>';

      Utils.el('migPreviewArea').classList.remove('hidden');
      Utils.el('migReportArea').classList.add('hidden');
    } catch (err) {
      Utils.toast(Utils.friendlyError(err), 'error');
    } finally {
      Utils.hideLoading();
    }
  },

  async executeMigration() {
    if (!this.migrationPreviewData) return;

    const ok = await Utils.confirmModal(
      `Import data dari tahun ${this.migrationPreviewData.tahunLama} ke tahun ${Shared.academicYear}? Data sedia ada TIDAK akan ditindih (ID sedia ada akan dilangkau).`,
      'Sahkan Import Migrasi'
    );
    if (!ok) return;

    try {
      Utils.showLoading('Mengimport data...');
      const result = await Api.call('executeMigration', {
        sheetUrl: this.migrationPreviewData.sheetUrl,
        oldAcademicYear: this.migrationPreviewData.tahunLama,
        newAcademicYear: Shared.academicYear,
        categories: this.migrationPreviewData.categories
      }, true);

      const content = Utils.el('migReportContent');
      content.innerHTML = Object.keys(result.report).map(cat => {
        const r = result.report[cat];
        return `<p><strong>${Utils.escapeHtml(cat)}</strong>: ${r.imported} diimport, ${r.skipped} dilangkau (ID sudah wujud), ${r.failed} gagal (data tidak sah)</p>`;
      }).join('');
      Utils.el('migReportArea').classList.remove('hidden');
      Utils.el('migPreviewArea').classList.add('hidden');
      Utils.toast('Migrasi selesai.', 'success');

      await Shared.refreshUnits();
      await Shared.refreshTeachers();
      await this.renderStudentTable(true);
      await this.renderTeacherTable(true);
      await this.renderUnitTable(true);
    } catch (err) {
      Utils.toast(Utils.friendlyError(err), 'error');
    } finally {
      Utils.hideLoading();
    }
  },

  // ==================== GENERIC TABLE: EDIT / DELETE ====================
  // simpanSemuaBtnId (pilihan): ID butang "Simpan Semua" di luar jadual ini -
  // muncul bila SEBARANG baris ada perubahan belum disimpan (dropdown ditukar
  // atau mod Edit dibuka), dan bila diklik, SEMUA baris tersebut (merentasi
  // pelbagai murid/guru sekaligus) dihantar dalam SATU kumpulan panggilan API.
  renderAdminTable(tableEl, rows, columns, idField, backendTable, onChanged, simpanSemuaBtnId) {
    const simpanSemuaBtn = simpanSemuaBtnId ? Utils.el(simpanSemuaBtnId) : null;

    if (!rows || rows.length === 0) {
      tableEl.innerHTML = '<thead><tr><th>Tiada data</th></tr></thead>';
      if (simpanSemuaBtn) simpanSemuaBtn.classList.add('hidden');
      return;
    }

    const columnsByKey = {};
    columns.forEach(c => { columnsByKey[c.key] = c; });

    let html = '<thead><tr>';
    columns.forEach(c => html += `<th>${Utils.escapeHtml(c.label)}</th>`);
    html += '<th>Tindakan</th></tr></thead><tbody>';

    rows.forEach(row => {
      html += `<tr data-id="${Utils.escapeHtml(row[idField])}">`;
      columns.forEach(c => {
        if (c.liveSelectOptions) {
          // Lajur "hidup" (cth: Unit Beruniform) - SENTIASA dipaparkan sebagai
          // dropdown (bukan perlu tekan "Edit" dahulu); tukar nilai terus
          // memanggil onLiveChange tanpa perlu tekan "Simpan".
          const opts = c.liveSelectOptions(row);
          const optionsHtml = opts.map(o =>
            `<option value="${Utils.escapeHtml(o.value)}" ${String(o.value) === String(row[c.key] || '') ? 'selected' : ''}>${Utils.escapeHtml(o.label)}</option>`
          ).join('');
          html += `<td data-key="${c.key}" data-editable="false"><select class="live-select" style="min-width:130px;">${optionsHtml}</select></td>`;
        } else {
          html += `<td data-key="${c.key}" data-editable="${c.editable}">${Utils.escapeHtml(row[c.key])}</td>`;
        }
      });
      html += `<td>
        <button class="btn btn-ghost action-btn edit-btn">Edit</button>
        <button class="btn btn-danger action-btn delete-btn">Padam</button>
      </td></tr>`;
    });
    html += '</tbody>';
    tableEl.innerHTML = html;

    // Baris "dirty" (perubahan belum disimpan) = butang Edit baris itu kini
    // tunjuk "Simpan". Butang "Simpan Semua" hanya muncul bila SEKURANG-
    // KURANGNYA satu baris berkeadaan begini.
    const updateSimpanSemuaVisibility = () => {
      if (!simpanSemuaBtn) return;
      const hasDirty = Array.from(tableEl.querySelectorAll('tr[data-id] .edit-btn')).some(b => b.textContent === 'Simpan');
      simpanSemuaBtn.classList.toggle('hidden', !hasDirty);
    };

    // Kumpul (TANPA hantar) sebarang perubahan pending bagi SATU baris -
    // dikongsi oleh butang Simpan seorang baris DAN butang "Simpan Semua".
    const buildRowSavePromises = (tr) => {
      const fields = {};
      tr.querySelectorAll('td[data-editable="true"]').forEach(td => {
        const input = td.querySelector('input, select');
        if (input) fields[td.dataset.key] = input.value.trim();
      });

      const row = rows.find(r => String(r[idField]) === tr.dataset.id);
      const promises = [];
      tr.querySelectorAll('td[data-key] select.live-select').forEach(sel => {
        const key = sel.closest('td').dataset.key;
        const col = columnsByKey[key];
        if (col && col.onLiveChange && row && String(sel.value) !== String(row[key] || '')) {
          promises.push(col.onLiveChange(row, sel.value));
        }
      });
      if (Object.keys(fields).length > 0) {
        promises.push(Api.call('editRecord', { table: backendTable, idField, id: tr.dataset.id, fields }, true));
      }
      return promises;
    };

    tableEl.querySelectorAll('tr[data-id]').forEach(tr => {
      tr.querySelectorAll('td[data-key] select.live-select').forEach(sel => {
        sel.addEventListener('change', () => {
          // JANGAN simpan serta-merta - tangguh sentiasa sehingga guru tekan
          // butang "Simpan" baris ini (atau "Simpan Semua"). Menukar dropdown
          // terus tukar butang ke "Simpan" (jika belum) supaya guru nampak
          // jelas ada perubahan belum disimpan - elak sistem "auto-save" bila
          // guru sekadar menyemak/menyelak pilihan pada banyak dropdown.
          const editBtn = tr.querySelector('.edit-btn');
          if (editBtn && editBtn.textContent !== 'Simpan') {
            editBtn.textContent = 'Simpan';
          }
          updateSimpanSemuaVisibility();
        });
      });
    });

    tableEl.querySelectorAll('tr[data-id]').forEach(tr => {
      const editBtn = tr.querySelector('.edit-btn');
      const deleteBtn = tr.querySelector('.delete-btn');

      editBtn.addEventListener('click', async () => {
        const isEditing = editBtn.textContent === 'Simpan';
        if (!isEditing) {
          tr.querySelectorAll('td[data-editable="true"]').forEach(td => {
            const value = td.textContent;
            const col = columnsByKey[td.dataset.key];
            if (col && col.options) {
              // Medan terhad (cth: Tahun murid) - guna dropdown supaya nilai
              // tidak sah tidak boleh ditaip secara bebas.
              const optionsHtml = col.options.map(opt =>
                `<option value="${Utils.escapeHtml(opt)}" ${String(opt) === String(value) ? 'selected' : ''}>${Utils.escapeHtml(opt)}</option>`
              ).join('');
              td.innerHTML = `<select style="width:90px;">${optionsHtml}</select>`;
            } else {
              td.innerHTML = `<input type="text" value="${Utils.escapeHtml(value)}" style="width:90px;">`;
            }
          });
          editBtn.textContent = 'Simpan';
          updateSimpanSemuaVisibility();
        } else {
          // Guru mungkin tekan "Simpan" ini akibat menukar dropdown SAHAJA
          // (tanpa pernah klik "Edit" untuk buka Nama/Kelas) - dalam kes
          // itu sel data-editable="true" MASIH teks biasa (bukan input),
          // jadi buildRowSavePromises() hanya kumpul fields daripada sel
          // yang BENAR-BENAR sudah ditukar ke input/select.
          const promises = buildRowSavePromises(tr);

          if (promises.length === 0) {
            // Tiada apa-apa berubah - jangan panggil server, kembali ke mod biasa sahaja.
            editBtn.textContent = 'Edit';
            updateSimpanSemuaVisibility();
            return;
          }

          try {
            Utils.showLoading('Mengemaskini...');
            await Promise.all(promises);
            Utils.toast('Rekod berjaya dikemaskini.', 'success');
            if (onChanged) onChanged();
          } catch (err) {
            Utils.toast(Utils.friendlyError(err), 'error');
          } finally {
            Utils.hideLoading();
          }
        }
      });

      deleteBtn.addEventListener('click', async () => {
        const ok = await Utils.confirmModal('Rekod akan ditandakan sebagai Tidak Aktif (bukan dipadam terus) untuk mengekalkan sejarah data. Teruskan?', 'Sahkan Padam');
        if (!ok) return;
        try {
          Utils.showLoading('Memadam...');
          await Api.call('softDeleteRecord', { table: backendTable, idField, id: tr.dataset.id }, true);
          Utils.toast('Rekod berjaya dinyahaktifkan.', 'success');
          if (onChanged) onChanged();
        } catch (err) {
          Utils.toast(Utils.friendlyError(err), 'error');
        } finally {
          Utils.hideLoading();
        }
      });
    });

    // ---- Simpan Semua: hantar SEMUA baris "dirty" (merentasi banyak murid/
    // guru sekaligus) dalam SATU kumpulan panggilan API, satu kali sahaja. ----
    updateSimpanSemuaVisibility();
    if (simpanSemuaBtn) {
      simpanSemuaBtn.onclick = async () => {
        const dirtyTrs = Array.from(tableEl.querySelectorAll('tr[data-id]')).filter(tr => {
          const btn = tr.querySelector('.edit-btn');
          return btn && btn.textContent === 'Simpan';
        });
        if (dirtyTrs.length === 0) return;

        const allPromises = [];
        dirtyTrs.forEach(tr => allPromises.push(...buildRowSavePromises(tr)));

        if (allPromises.length === 0) {
          dirtyTrs.forEach(tr => { tr.querySelector('.edit-btn').textContent = 'Edit'; });
          updateSimpanSemuaVisibility();
          return;
        }

        try {
          Utils.showLoading(`Menyimpan ${dirtyTrs.length} rekod sekaligus...`);
          await Promise.all(allPromises);
          Utils.toast(`${dirtyTrs.length} rekod berjaya disimpan sekaligus.`, 'success');
          if (onChanged) onChanged();
        } catch (err) {
          Utils.toast(Utils.friendlyError(err), 'error');
        } finally {
          Utils.hideLoading();
        }
      };
    }
  },

  // ==================== ZON BAHAYA ====================
  // Dua lapisan pengesahan: modal penerangan (Utils.confirmModal) + guru
  // mesti TAIP tepat frasa pengesahan (window.prompt). Backend turut
  // mengesahkan semula frasa yang sama (pertahanan berlapis) - lihat
  // Danger.gs. Skop terhad kepada tahun akademik SEMASA sahaja.
  async dangerDeleteRecords() {
    const ok = await Utils.confirmModal(
      `Ini akan PADAM SEMUA rekod Kehadiran, eRPH, dan Laporan Mingguan bagi tahun akademik ${Shared.academicYear}. Data Murid/Guru/Unit TIDAK terjejas. Tindakan ini TIDAK BOLEH DIBATALKAN.`,
      'Amaran: Padam Semua Rekod'
    );
    if (!ok) return;

    const typed = window.prompt('Untuk sahkan, taip TEPAT: PADAM REKOD');
    if (typed === null) return; // guru batalkan prompt
    if (typed !== 'PADAM REKOD') {
      Utils.toast('Teks pengesahan tidak sepadan. Tindakan dibatalkan.', 'error');
      return;
    }

    try {
      Utils.showLoading('Memadam semua rekod...');
      const result = await Api.call('deleteAllTransactionRecords', {
        academicYear: Shared.academicYear, confirmText: typed
      }, true);
      const summary = Object.keys(result.counts).map(k => `${k}: ${result.counts[k]}`).join(', ');
      Utils.toast(`Semua rekod tahun ${Shared.academicYear} berjaya dipadam (${summary}).`, 'success', 8000);
    } catch (err) {
      Utils.toast(Utils.friendlyError(err), 'error');
    } finally {
      Utils.hideLoading();
    }
  },

  async dangerDeleteAll() {
    const ok = await Utils.confirmModal(
      `Ini akan PADAM SEMUA DATA (Murid, Guru, Unit, Penempatan, Kehadiran, eRPH, Laporan) bagi tahun akademik ${Shared.academicYear}. Tindakan ini TIDAK BOLEH DIBATALKAN.`,
      'Amaran: Padam SEMUA Data'
    );
    if (!ok) return;

    const typed = window.prompt('Untuk sahkan, taip TEPAT: PADAM SEMUA');
    if (typed === null) return;
    if (typed !== 'PADAM SEMUA') {
      Utils.toast('Teks pengesahan tidak sepadan. Tindakan dibatalkan.', 'error');
      return;
    }

    try {
      Utils.showLoading('Memadam semua data...');
      const result = await Api.call('deleteAllData', {
        academicYear: Shared.academicYear, confirmText: typed
      }, true);
      const summary = Object.keys(result.counts).map(k => `${k}: ${result.counts[k]}`).join(', ');
      Utils.toast(`Semua data tahun ${Shared.academicYear} berjaya dipadam (${summary}).`, 'success', 8000);

      await Shared.refreshUnits();
      await Shared.refreshTeachers();
      Shared.populateAllUnitsSelect(Utils.el('placeUnitSelect'));
      Shared.populateAllUnitsSelect(Utils.el('placeTeacherUnitSelect'));
      await this.renderStudentTable(true);
      await this.renderTeacherTable(true);
      await this.renderUnitTable(true);
    } catch (err) {
      Utils.toast(Utils.friendlyError(err), 'error');
    } finally {
      Utils.hideLoading();
    }
  }
};
