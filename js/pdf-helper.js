/*
  pdf-helper.js
  -------------
  Fungsi kongsi untuk menjana PDF (guna jsPDF) supaya setiap PDF
  (Kehadiran / eRPH / Laporan Mingguan) mempunyai header & format
  yang seragam dan profesional, sesuai untuk cetakan A4.
*/

const PdfHelper = {
  _logoCache: null,

  async getLogoDataUrl() {
    if (this._logoCache) return this._logoCache;
    try {
      this._logoCache = await new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || 100;
          canvas.height = img.naturalHeight || 100;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => reject(new Error('Logo tidak ditemui'));
        img.src = CONFIG.LOGO_PATH;
      });
    } catch (e) {
      this._logoCache = null; // teruskan tanpa logo jika gagal
    }
    return this._logoCache;
  },

  newDoc() {
    const { jsPDF } = window.jspdf;
    return new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  },

  async drawHeader(doc, titleLines) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const logo = await this.getLogoDataUrl();

    if (logo) {
      try { doc.addImage(logo, 'PNG', 14, 10, 18, 18); } catch (e) { /* abaikan jika format tidak serasi */ }
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(CONFIG.SCHOOL_NAME, pageWidth / 2, 15, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(CONFIG.SCHOOL_LOCATION, pageWidth / 2, 20, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(CONFIG.SYSTEM_NAME, pageWidth / 2, 25, { align: 'center' });

    let y = 33;
    doc.setDrawColor(180);
    doc.line(14, y, pageWidth - 14, y);
    y += 6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    (titleLines || []).forEach(line => {
      doc.text(line, pageWidth / 2, y, { align: 'center' });
      y += 5;
    });

    return y + 3; // Y posisi untuk mula kandungan
  },

  drawFooter(doc) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(
        `Dijana oleh ${CONFIG.SYSTEM_NAME} - ${Utils.formatDateDisplay(Utils.todayIso())} - Muka Surat ${i}/${pageCount}`,
        pageWidth / 2, pageHeight - 8, { align: 'center' }
      );
      doc.setTextColor(0);
    }
  },

  // Pastikan posisi Y tidak melepasi tepi bawah kertas; jika ya, tambah page baru
  ensureSpace(doc, y, neededHeight = 10) {
    const pageHeight = doc.internal.pageSize.getHeight();
    if (y + neededHeight > pageHeight - 15) {
      doc.addPage();
      return 20;
    }
    return y;
  }
};
