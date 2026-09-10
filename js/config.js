/*
  config.js
  ---------
  Semua tetapan sistem yang boleh berubah diletakkan di sini SAHAJA.
  Bila Google Apps Script Web App di-deploy semula dan URL berubah,
  cukup tukar WEBAPP_URL di bawah - tidak perlu sentuh fail lain.
*/

const CONFIG = {
  // GANTIKAN dengan URL "Web App" selepas deploy Google Apps Script.
  // Contoh: https://script.google.com/macros/s/AKfycbXXXXXXXXXXXXXXXXXX/exec
  WEBAPP_URL: 'https://script.google.com/macros/library/d/18YOzEnO1MGrbrlWHfVeRtTd_wg7_-R5h4X1PIYfWFZAUglgwIbvJFzKs/8',

  SCHOOL_NAME: 'SEKOLAH KEBANGSAAN SERI JAYA',
  SCHOOL_LOCATION: 'KEMAMAN, TERENGGANU',
  SYSTEM_NAME: 'SISTEM PENGURUSAN KOKURIKULUM',
  SYSTEM_NAME_SHORT: 'eKOKUM SEKOLAH KEBANGSAAN SERI JAYA',
  LOGO_PATH: 'https://i.postimg.cc/DZkdW8qn/Logo-SK-Seri-Jaya-Transparent.png',

  TIMEZONE: 'Asia/Kuala_Lumpur',
  LOCALE: 'ms-MY',

  TOTAL_WEEKS: 12,

  KATEGORI_LIST: [
    'UNIT BERUNIFORM',
    'KELAB / PERSATUAN',
    'SUKAN / PERMAINAN'
  ],

  TAHUN_LIST: [4, 5, 6],

  SIVIK_LIST: [
    'KHIDMAT MASYARAKAT',
    'KEROHANIAN',
    'KELESTARIAN',
    'ALAM',
    'KEPIMPINAN',
    'KEBUDAYAAN',
    'KEPEKAAN',
    'TANGGUNGJAWAB',
    'PENGURUSAN',
    'MASA',
    'EKOSISTEM',
    'KENEGARAAN',
    'ALAM SEKITAR'
  ],

  PPIKEBM_LIST: [
    'AKHBAR PEMBUKA MINDA',
    'AKULAH JAGUH',
    'BINA KATA',
    'BISIK-BISIK SAYANG',
    'BURUNG TIONG',
    'CAKNA MATA',
    'CHEF CILIK',
    'CUIT-CUIT FIKIR',
    'DJ HATIKU',
    'FIKIR-FIKIRKAN',
    'GETARAN BAHASA',
    'HAI HAIKU',
    'JIKA MAKA',
    'JUALAN LANGSUNG',
    'RAWAT BAHASA',
    'SAHUTLAH PANGGILANKU',
    'SORAK BERENTAK',
    'STESEN KE STESEN',
    'SULUH PEDOMAN',
    'TAK KENAL MAKA TAK CINTA',
    'TEKA KATA PILIHAN',
    'TELEFON CIKGU',
    'TERAMPIL DAN TELADAN',
    'TIGA PERKATAAN SAHAJA',
    'USAHAWAN MUDA',
    'AKHBAR MINDA',
    'AKSI SPONTAN'
  ],

  // Kunci simpanan token admin dalam sessionStorage (hilang bila tab ditutup)
  ADMIN_SESSION_KEY: 'kokum_admin_token'
};
