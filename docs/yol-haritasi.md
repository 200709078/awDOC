# awDOC yol haritası

Kelime işlemci (Microsoft Word / Google Dokümanlar tarzı). Kullanıcının istekleri ve öneriler tarihiyle buraya
yazılır; kullanıcı açıkça istemeden uygulanmaz. Kullanıcı 2026-11-17'de "başla" dedi; 1. aşama (iskelet) aynı gün bitti.

## Kararlar (2026-11-17)

- **Ad: awDOC** (kullanıcı kararı). "awWord" düşünülmüştü; "Word" Microsoft markası olduğu için Google Play
  riskine karşı awPDF / awCELL düzeninde awDOC seçildi.
- **Görünüm:** Önce sürekli (sayfasız) görünüm, A4 sayfa görünümü sonra eklenir (kullanıcı kararı).
- **Dosya türleri:** `.doc`, `.docx`, LibreOffice (`.odt`) sonraki sürümlere kalır; altyapı bunların sonradan
  eklenebileceği biçimde kurulur (kullanıcı kararı).
- **Odak: öğretmen yolu** (kullanıcı kararı): genel bir kelime işlemci tabanı ve onu öne çıkaran öğretmen /
  sınav kâğıdı özellikleri. Uygulama genel kullanım (dilekçe, rapor, ödev) için de tam çalışır. Aşağıdaki
  "Odak" bölümüne bakın.

## GitHub deposu (2026-11-17, kullanıcı isteği: "github ayarları da diğerleri gibi olsun")

`github.com/200709078/awDOC` açıldı. Ayarlar drAW ailesi, awPDF ve awCELL ile aynı: açık (public) depo, ana dal
`main`, Issues/Wiki/Projects açık, dal koruması ve Pages yok, Actions'ta bütün eylemler serbest, iş akışı izni
okuma. Dört imza secret'ı da var: `ANDROID_KEYSTORE_BASE64` ve `ANDROID_KEY_ALIAS` Claude yükledi,
`ANDROID_KEYSTORE_PASSWORD` ve `ANDROID_KEY_PASSWORD`'ü kullanıcı girdi (2026-11-17). İlk commit iskeletle birlikte gönderildi.

## Teknik öneriler (2026-11-17, öneri)

- **Paketler (kullanıcı onayı 2026-11-17):** kardeşlerle aynı; GitHub Releases'te sürüm numarasız adlarla
  `awDOC-linux-x86_64.AppImage`, `awDOC-linux-amd64.deb`, `awDOC-win-x64.exe`, `awDOC-android.apk` ve
  `SHA256SUMS.txt`; Play için `awDOC-android.aab` (`play-Android` artifact'ı). Web sürümü `madematik.com/awDOC/`.
- **İlk commit:** yol haritası iskeletle birlikte gönderilir (kullanıcı kararı 2026-11-17).
- **Sürüm yok, yalnız commit (kullanıcı kararı 2026-11-17):** "Sadece commit yap. Bütün aşamalar bitmeden sürüm
  yayınlamayalım." Aşamalar (1–6) bitene kadar sürüm etiketi, GitHub sürümü, canlıya alma ve Play yok; işler
  yalnız yerelde commit'lenir, push kullanıcı isteyince yapılır. İskeletin ilk commit'i bu karardan hemen önce
  `main`'e gönderilmişti (sürüm iş akışı çalışmadı).

- Kardeşlerle aynı altyapı: TypeScript + Vite; Electron (Linux `.deb`/AppImage, Windows `.exe`), Capacitor
  (Android `.apk`, Play için `.aab`). `release.yml` ve `scripts/release-assets.mjs` aileyle birebir aynı; ortak
  imza anahtarı; ortak araç çubuğu stili (▾ gruplar, ☰/✕); Hakkında penceresi; reklam yok.
  Canlı adres `madematik.com/awDOC/`.
- **Düzenleyici çekirdeği: TipTap (ProseMirror), MIT.** `contenteditable` üzerine sıfırdan yazılmaz.
- **Kendi dosya biçimi: `.awd`** (öneri; awCELL'in `.awc`'si gibi). İçinde belgenin ProseMirror JSON'u,
  sürüm numarası ve gömülü resimler bulunur.
- **Dosya biçimi altyapısı:** Belge modeli tek (ProseMirror JSON). Her dosya türü `src/formats/` altında
  aynı arayüzü uygulayan bir bağdaştırıcıdır: `{ id, uzantılar, mime, oku(bayt) → belge, yaz(belge) → bayt }`.
  Aç / Kaydet / Farklı kaydet menüleri bu kayıttan beslenir. İlk sürümde yalnız `.awd`, `.txt`, `.html` ve
  PDF'e aktarma (yazdırma) olur; `.docx` / `.odt` / `.doc` sonradan bağdaştırıcı olarak eklenir, düzenleyiciye
  dokunmadan.
  - `.docx`: açmak için `mammoth` (bazı biçimler kaybolur), kaydetmek için `docx` kütüphanesi.
  - `.odt`: ZIP içinde XML; tarayıcıda yazılabilir.
  - `.doc` (eski ikili biçim): tarayıcıda güvenilir okuyucu yok. Masaüstünde (Electron) bilgisayarda kurulu
    LibreOffice ile arka planda dönüştürülebilir (Pardus'ta kurulu gelir); web ve Android'de açık soru.
- Yazım denetimi: Electron'da Chromium'un Türkçe sözlüğü; web ve Android'de tarayıcınınki.

## Önerilen aşamalar (2026-11-17, öneri)

1. **İskelet:** Vite + TS, Electron, Capacitor, sürüm iş akışı, Hakkında, araç çubuğu, deploy betiği.
   **Uygulandı (2026-11-17).** Ayrıntı aşağıda, "1. aşama: iskelet".
2. **Çekirdek düzenleyici (sürekli görünüm):** paragraf ve başlık stilleri; K/İ/A/üstü çizili; yazı tipi,
   boyut, renk, vurgu; hizalama, satır aralığı, girinti; madde ve numaralı listeler; tablo; resim; bağlantı;
   bul-değiştir; geri al/yinele; kelime sayısı; `.awd` kaydet/aç, otomatik kaydetme, son belgeler;
   yazdır / PDF'e aktar.
3. **A4 sayfa görünümü:** kenar boşlukları, sayfa sonu, üst/alt bilgi, sayfa numarası, yatay/dikey sayfa.
4. **Öğretmen özellikleri:** formül düzenleyici, soru bloğu (otomatik numara, puan, A–E şıklar yan yana /
   alt alta), sınav başlığı şablonu, iki sütunlu kâğıt, cevap anahtarı, A/B kitapçığı, drAW2D/drAW3D ve
   awPDF'ten görsel ekleme, soru bankası. Formül ve soru bloğu sürekli görünümde de çalışır; iki sütun ve
   "soru bölünmesin" A4 aşamasından sonra gelir. Sıra (kullanıcı kararı 2026-11-17): önce formül ve soru bloğu.
5. **Dosya dönüştürme:** `.docx`, `.odt`, `.doc` bağdaştırıcıları.
6. **İleri genel özellikler:** içindekiler, dipnot, yorumlar, izlenen değişiklikler, adres-mektup birleştirme.

## Odak: öğretmen yolu (2026-11-17, kullanıcı kararı)

Kullanıcı genel kullanımın da sürüp sürmeyeceğini sordu; yanıt: evet. Öğretmen yolu genel kelime işlemcinin
yerine geçmez, üstüne eklenir. Çekirdek (aşama 1–3) ve dosya türleri iki yolda da aynıdır; fark yalnız sıradadır:
öğretmen özellikleri (aşama 4) öne, ileri genel özellikler (aşama 6) sonraya alınır.

Tasarım kuralı (öneri): öğretmen araçları genel kullanımı karıştırmaz. Yeni belge açarken "Boş belge" ve
"Sınav kâğıdı" seçilir; boş belgede araç çubuğu sade kalır, soru/şık araçları yalnız sınav kâğıdında ya da kendi
grubunda ("Sınav ▾") görünür. Formül her belgede kullanılabilir.

Teknik: soru bloğu, şık dizisi ve formül ProseMirror'da ayrı düğüm türleridir; çekirdek yeniden yazılmaz.
`.docx`'e aktarırken bu düğümler sıradan paragraf / tablo / resme çevrilir (ayrıntı aşama 5'te).

## 1. aşama: iskelet (2026-11-17, uygulandı)

Kullanıcı "başla" dedi (2026-11-17). Yapılanlar:

- **Altyapı:** TypeScript + Vite, TipTap 3.32.2 (StarterKit + hizalama), Electron 44, Capacitor 8. Android projesi
  ve Electron kabuğu awPDF'ten alındı. `release.yml` ve `release-assets.mjs` kardeşlerle birebir aynı. Simge
  ailenin biçiminde (mavi A, kırmızı W, kıvrık köşeli sayfa, altta DOC).
- **Düzenleyici (sürekli görünüm):** A4 genişliğinde beyaz kâğıt, telefonda kâğıt ekranı doldurur. Hazır olanlar:
  - kalın, italik, altı çizili, üstü çizili,
  - normal metin ve Başlık 1–3,
  - madde işaretli ve numaralı liste,
  - dört hizalama,
  - geri al / yinele.
- **Araç çubuğu (ortak stil):**
  - Sıra: Yeni, Aç, Kaydet, Geri Al, Yinele, Yazı ▾, Paragraf ▾, Liste ▾, Hizalama ▾, Yazdır, Farklı
    Kaydet, Tam Ekran, Koyu Tema; ☰ menüsünün sonunda Hakkında. Sığmayanlar sondan başlayarak ☰'ye geçer;
    menüde gruplar yerinde açılır.
  - Yazı ▾ seçimden sonra açık kalır.
  - Grup düğmesi durumu gösterir: hizalama ve başlık simgesi değişir, etkin biçimde nokta çıkar.
  - Telefonda (520 pikselden dar) belge adı gizlenir; kaydedilmemiş değişiklik Kaydet düğmesindeki noktadan
    anlaşılır.
- **Dosyalar:**
  - `.awd` (UTF-8 JSON, sürüm numaralı) açılır ve kaydedilir; `.txt` açılır.
  - "Kaydet" açılan dosyanın üzerine yazar: Chromium'da, masaüstünde ve Android'de. Yazamazsa nereye
    kaydedileceğini sorar. Düz metin dosyasının üzerine yazmaz, `.awd` olarak yer sorar.
  - Kaydedilmemiş değişiklik varken önce sorar. Bozuk ya da tanınmayan dosya açık belgeye dokunmaz.
  - Dosya biçimi altyapısı `src/formats/`: `.docx`, `.odt`, `.doc` buraya eklenecek.
- **Kısayollar:** Ctrl+S, Ctrl+Shift+S, Ctrl+O, Ctrl+N, Ctrl+P, F11. Ctrl+Shift+S TipTap'te "üstü çizili"
  kısayoluydu; Farklı Kaydet öne alındı, üstü çizilinin kısayolu yok.
- **Denendi:**
  - Playwright testleri (45).
  - Electron'da kaynak koddan ve paketlenmiş hâliyle: komut satırından açma, Ctrl+S ile aynı dosyaya yazma.
  - Telefonda (deneme sürümü, 2026-11-17): Türkçe klavye ve önerileri, Yazı ▾ açıkken klavyenin açık kalması,
    sistemin kaydetme ekranı, ikinci Kaydet'in aynı dosyaya yazması, açma, geri düğmesi.
  - Gerçek tahtada ve Windows'ta henüz denenmedi.
- **Bekleyenler:**
  - Canlıya alma: sunucuda `public_html/public/awDOC` klasörü ve `.env` henüz yok.
  - madematik.com'da awDOC sayfası (Hakkında'daki indirme bağlantısı `projelerim/awdoc` oraya gider).
  - İlk sürüm (etiket) ve Play kaydı.
  - Bunların hepsi kullanıcıya sorulacak.
