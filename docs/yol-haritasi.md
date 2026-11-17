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
- **Web sürümü canlıda (kullanıcı isteği 2026-11-17):** Kullanıcı `public_html/public/awDOC` klasörünü açıp
  yüklenmesini istedi; iskelet `npm run deploy` ile madematik.com/awDOC/'a çıktı ve kullanıcı çalıştığını doğruladı.
  Bu, "sürüm yok" kuralının istisnasıdır: paket sürümü (etiket, GitHub Releases, Play) yine aşamalar bitince.
  Web'e sonraki yüklemeler de kullanıcı isteyince yapılır. madematik.com'daki Projelerim listesine ekleme
  ayrıca sorulacak.

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
   yazdır / PDF'e aktar. **Uygulandı (2026-11-17).** Ayrıntı aşağıda, "2. aşama".
3. **A4 sayfa görünümü:** kenar boşlukları, sayfa sonu, üst/alt bilgi, sayfa numarası, yatay/dikey sayfa.
   **Uygulandı (2026-11-17).** Ayrıntı aşağıda, "3. aşama".
4. **Öğretmen özellikleri:** formül düzenleyici, soru bloğu (otomatik numara, puan, A–E şıklar yan yana /
   alt alta), sınav başlığı şablonu, iki sütunlu kâğıt, cevap anahtarı, A/B kitapçığı, drAW2D/drAW3D ve
   awPDF'ten görsel ekleme, soru bankası. Formül ve soru bloğu sürekli görünümde de çalışır; iki sütun ve
   "soru bölünmesin" A4 aşamasından sonra gelir. Sıra (kullanıcı kararı 2026-11-17): önce formül ve soru bloğu.
   **Başladı (2026-11-17):** formül ve soru bloğu uygulandı. Ayrıntı aşağıda, "4. aşama".
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
  - madematik.com'da awDOC sayfası (Hakkında'daki indirme bağlantısı `projelerim/awdoc` oraya gider).
  - İlk sürüm (etiket) ve Play kaydı.
  - Bunların hepsi kullanıcıya sorulacak.

## 2. aşama: çekirdek düzenleyici (2026-11-17'de başladı)

Kullanıcı web yüklemesinden sonra "2. aşamaya geç" dedi. Alt adımlar, her biri test edilip ayrı commit'lenir:

1. **Yazı tipi, boyut, yazı rengi, vurgu: uygulandı (2026-11-17).**
   - Yazı ▾ bölümlü bir pencere oldu: K/İ/A/S; "Boyut: 12" başlıklı Küçült/Büyüt (Word'ün 8–72 listesinde
     adım adım); yazı rengi; vurgu.
   - Renkler ailenin kuralına göre hazır kutucuklar. Sistemin renk seçicisi yalnız "Diğer renk…" ile açılır.
     Seçili renk halkayla gösterilir; A simgesinin alt çizgisi yazının rengini alır.
   - Yeni Yazı Tipi ▾ grubu: Calibri (belgenin yazı tipi), Arial, Times New Roman, Verdana, Georgia, Comic
     Sans MS, Courier New. Adlar kendi yazı tipleriyle yazılır. Linux'ta karşılıkları kullanılır (Carlito,
     Liberation).
   - Başlıkta boyut başlığın kendi boyutundan başlar.
2. **Satır aralığı ve girinti: uygulandı (2026-11-17).**
   - Hizalama ▾ üç bölümlü oldu: hizalama, girinti (Azalt/Artır), satır aralığı (1,0 / 1,15 varsayılan /
     1,5 / 2,0).
   - Tab girintiyi artırır, listede maddeyi bir öncekinin altına alır; Shift+Tab geri alır. Tab artık odağı
     belgeden çıkarmaz.
   - Bir girinti 1,27 cm, en çok 8. Belgenin varsayılan satır aralığı Word'deki gibi 1,15 oldu (önce 1,5'ti).
   - Girinti ve satır aralığı paragrafla birlikte `.awd`'ye kaydedilir.
3. **Bağlantı, bul-değiştir, kelime sayısı: uygulandı (2026-11-17).**
   - **Bul (Ctrl+F) ve Bul ve Değiştir (Ctrl+H):** araç çubuğunun altında açılan çubuk.
     - Türkçe harflere uyumlu: I/ı/İ/i aynı sayılır, büyük/küçük harf ayrılmaz.
     - Bütün eşleşmeler sarı, o anki turuncu işaretlenir; "3 / 10" sayacı var. Enter sonrakine, Shift+Enter
       öncekine gider; Esc kapatır.
     - "Değiştir" önce eşleşmeyi seçip gösterir, ikinci basışta değiştirir. "Tümünü Değiştir" kaç yeri
       değiştirdiğini söyler.
   - **Bağlantı (Ctrl+K):** seçili yazıyı bağlantı yapar; seçim yoksa görünen yazıyı da sorar. Bağlantının
     üstündeyken düzenler, açar ya da kaldırır.
     - "madematik.com" https:// ile, e-posta adresi mailto: ile tamamlanır.
     - Yalnız web ve e-posta adresleri kabul edilir (javascript:, file: gibi adresler reddedilir).
   - **Kelime Sayısı (Ctrl+Shift+G, ☰ menüsünde):** kelime, boşluklu/boşluksuz karakter ve paragraf sayısını
     gösterir; seçim varsa yalnız seçili bölümü sayar.
4. **Tablo: uygulandı (2026-11-17).**
   - Tablo ▾ grubu. "Tablo Ekle…" penceresi satır ve sütun sayısını, isteğe bağlı başlık satırını sorar.
   - Bölümler:
     - Satır: üste ekle, alta ekle, sil.
     - Sütun: sola ekle, sağa ekle, sil.
     - Hücre: birleştir, böl, başlık satırı.
     - Tabloyu sil.
   - Tablo dışındayken bu araçlar devre dışıdır. Simgeler yanlış anlaşılabileceği için hepsi adıyla durur.
   - Tab hücreler arasında gezer. Sütun kenarı sürüklenerek genişletilir. Hücreler sürüklenerek seçilip
     birleştirilir.
   - Word'ün "Tablo Kılavuzu" gibi siyah çizgili sade görünüm.
   - Düz metne kaydederken bir satır tek satır olur, hücreler sekmeyle ayrılır.
5. **Resim: uygulandı (2026-11-17).**
   - Resim düğmesiyle seçilir; panodan yapıştırılır (ekran görüntüsü), sayfaya sürüklenip bırakılır; Aç ile
     ya da pencereye bırakılan resim de belgeye girer.
   - Resim satır içinde durur (Word'ün varsayılanı); Hizalama ▾ onu sola, ortaya, sağa alır.
   - Seçilince köşelerinde dört tutamaç çıkar; sürükleyince oranı bozulmadan büyür ya da küçülür. Tutamaçlar
     dokunmatik ekran için büyük, yazdırılmaz.
   - Belgeye konmadan önce hazırlanır: telefon fotoğrafının yönü düzeltilir, en uzun kenar en çok 1600
     piksel olur; fotoğraf JPEG, saydam olabilecek resim PNG olarak saklanır. Sayfa genişliğini (600 piksel)
     aşmadan başlar.
   - Okunamayan resimde uyarı çıkar. SVG alınmaz (içinde betik olabilir).
   - `.awd` içinde veri olarak durur, böylece belge tek dosyadır. Çok resimli belgeler büyürse
     `.awd` ZIP'e geçebilir (sürüm 2).
6. **Otomatik kaydetme ve son belgeler: uygulandı (2026-11-17).**
   - **Kurtarma kopyası (her zaman):** kaydedilmemiş değişiklik varken yazmaya 2 saniye ara verilince belgenin
     kopyası yalnız bu cihaza (IndexedDB) yazılır. Uygulama kapanır, çöker ya da telefon onu kapatırsa bir
     sonraki açılışta "Kaydedilmemiş belge bulundu" diye sorulur (Geri Yükle / Sil). Belge kaydedilince,
     yeni belge açılınca ya da Sil seçilince kopya silinir.
   - **Otomatik Kaydet (☰ menüsünde anahtar, varsayılan açık):** bir `.awd` dosyasından gelen ya da
     kaydedilmiş belge, yazmaya 4 saniye ara verilince kendi dosyasına sessizce yazılır. Adsız belgede ve
     düz metinde bir şey yapmaz. Yazamazsa bir kez uyarır; o belgede Kaydet ile devam edilir. Seçim cihazda
     saklanır. Varsayılan açık kalır (kullanıcı kararı 2026-11-17, "hepsine evet").
   - **Son Belgeler (☰ menüsünde):** açılan ve kaydedilen son 12 belge, tarihleriyle. Dokununca belge yeniden
     açılır (önce kaydedilmemiş değişiklik sorulur). Dosya silinmiş ya da izin kalkmışsa söylenir ve listeden
     çıkar. Yeniden bulma: tarayıcıda dosya tutamacı (Chromium), masaüstünde kabuğun verdiği kalıcı kimlik
     (`belgeler.json`), Android'de kalıcı izinli içerik adresi.
   - Electron denemesi artık kendi geçici profilinde çalışır (`AWDOC_USER_DATA`). Önceki denemelerin
     kullanıcının profilinde bıraktığı izler silindi.
7. **PDF'e aktarma: uygulandı (2026-11-17).**
   - "PDF Olarak Kaydet" (☰ menüsünde). Masaüstünde Electron'un kendi PDF üreticisiyle: yer sorulur, A4,
     yalnız belge basılır, kenar boşlukları yazdırmadaki gibi.
   - Web'de ve Android'de doğrudan PDF yazan bir yol yok: yazdırma penceresi açılır ve "PDF olarak kaydet"i
     seçmesi söylenir. Önerilen dosya adı belgenin adıdır.
   - Yazdırmada ve PDF'te imleç, arama işaretleri ve resim tutamaçları görünmez.

**2. aşama bitti (2026-11-17).** Playwright testleri 80, Electron denemesi (kaynaktan) geçiyor. Gerçek tahtada,
Windows'ta ve telefonda 2. aşama henüz denenmedi (telefon 1. aşamada denendi). Sırada 3. aşama: A4 sayfa
görünümü.

**2. aşamadan sonra (kullanıcı kararı 2026-11-17, "hepsine evet"):** Otomatik Kaydet varsayılan açık kalır;
2. aşama GitHub'a gönderildi ve madematik.com/awDOC/'a yüklendi; 3. aşamaya geçildi.

## 3. aşama: A4 sayfa görünümü (2026-11-17, uygulandı)

Kullanıcı 2. aşamanın sonunda "hepsine evet" dedi (3. aşamaya geç). Yapılanlar:

- **Sayfa görünümü:** belge A4 kâğıtlar hâlinde, kâğıtların arasında gri boşlukla görünür. Sayfaya sığmayan
  satır bir sonraki sayfanın başına geçer: paragraf satır satır, tablo satır satır bölünür (tablo satırı ikiye
  bölünmez; bir sayfadan uzun tek satır ya da resim olduğu yerde kalır). Yazdıkça, sildikçe hemen yeniden dizilir.
- **Sürekli görünüm** kalır; ikisi arasında Sayfa ▾ içinden geçilir, seçim cihazda hatırlanır. Genişliği 900
  pikselden az ekranlar (telefon) sürekli görünümle açılır, geniş ekranlar sayfa görünümüyle.
- **Masaüstünde sürekli görünüm de sayfanın genişliğinde ve kenar boşluklarındadır:** satırlar kâğıttakiyle aynı
  yerden kırılır, sayfalar bu görünümde de bilinir (Sayfa ▾ kaç sayfa olduğunu yazar).
- **Yazdırma ve PDF ekrandaki sayfaları aynen basar:** sayfa ekranda nerede bölünüyorsa kâğıtta da orada bölünür
  (masaüstü ve tarayıcı PDF'i ile denendi). Telefonun dar sürekli görünümünde bölmeyi yazdırma kendisi yapar.
- **Sayfa sonu (Ctrl+Enter ya da Sayfa ▾):** sonrası yeni sayfada başlar. Sürekli görünümde kesikli bir çizgi
  ("Sayfa sonu"), sayfa görünümünde sayfanın son satırının altında küçük bir işaret. Seçilip silinebilir. Liste
  ve tablo içinde çalışmaz (yalnız belgenin kendi paragrafları arasında).
- **Sayfa Düzeni… penceresi (Sayfa ▾):** dikey / yatay; kenar boşlukları (Normal 2,5 cm, Dar 1,27 cm, Geniş
  2,5 / 5 cm ya da cm olarak elle, 0,5–8 cm); üst bilgi ve alt bilgi (her sayfada bir satır, ortada); sayfa
  numarası (yok, altta ortada, altta sağda, üstte sağda) ve biçimi ("1", "1 / 3", "Sayfa 1"). Dikey / Yatay
  Sayfa ▾ içinde ayrıca tek dokunuşla değişir.
- **Sayfa ayarı belgenin içinde saklanır** (`.awd` dosyasında, kurtarma kopyasında); Ctrl+Z ile geri alınır.
  Eski `.awd` dosyaları varsayılan sayfayla (A4 dikey, 2,5 cm) açılır. Dosyadaki bozuk değerler varsayılana ya
  da sınıra döner.
- Varsayılan kenar boşlukları Word'deki gibi 2,5 cm oldu (önceden yazdırmada 2 / 2,5 cm idi).
- **Bulunup düzeltilen bir yarış (her yerde):** End ya da Shift+Home'dan hemen sonra basılan bir kısayol
  (Ctrl+Enter, Enter, Tab, Ctrl+B…) eski imleç yerinde çalışabiliyordu; artık önce klavyenin yaptığı seçim okunur.
- Testler: 8 yeni Playwright testi (toplam 88); Electron denemesi sayfa düzenini kaydeder, sayfa sonuyla iki
  sayfalık PDF üretir; PDF'te üst bilgi ve "1/2", "2/2" var.

**Bilinen sınırlar (sonraya):**
- Tablonun başlık satırı yeni sayfada tekrarlanmaz; bir sayfadan uzun tek tablo satırı bölünmez.
- Üst / alt bilgi düz, tek satır, ortalı metin; "ilk sayfada farklı" yok; içine resim ya da tarih konamaz.
- Sayfa görünümünü küçültme / büyütme (yakınlaştırma) yok: telefonda sayfa görünümü yana kaydırılır.
- Kâğıt yalnız A4 (A5, Letter yok).
- Çok uzun belgede (50+ sayfa) her tuşta sayfalara bölme ölçümü masaüstünde ~12 ms sürer; tahtada yavaşlık
  görülürse yalnız düzenlenen sayfadan sonrasını yeniden ölçmek mümkün.

**Denenmedi:** gerçek tahta, Windows, telefon (Android'in yazdırmasında üst / alt bilgi ve sayfa numarası).

## 4. aşama: öğretmen özellikleri (2026-11-17'de başladı)

Kullanıcı 3. aşamanın sonunda "evet. devam et" dedi. Sıra (kullanıcı kararı): önce formül ve soru bloğu.
Alt adımlar (öneri, 2. aşamadaki gibi her biri ayrı commit):

1. **Formül: uygulandı (2026-11-17).**
   - **Düzenleyici:** Görsel formül düzenleyici MathLive (MIT; 0.111.4, sabit sürüm). LaTeX bilmeden yazılır:
     `/` kesir, `^` üs, `_` alt indis, `sqrt` kök, `pi` π. Ondalık ayırıcı virgül (3,5).
   - **Pencere:** Formül penceresinde sık kullanılanlar paleti var: kesir, üs, kök, mutlak değer, ±, ×, ÷, ≤, ≥,
     ≠, π, ∞, derece, açı, üçgen, paralel, dik, küme işaretleri, ∑, ∫, lim, log, sin/cos, Yunan harfleri, matris.
   - **LaTeX kutusu:** LaTeX bilenler için ayrı bir kutu var.
   - **Klavye:** "Klavye" düğmesi MathLive'ın matematik klavyesini açar (tahta ve telefon için); klavye ekranın
     altında, pencere üstünde durur. Dokunmatik ekranda alana dokununca kendiliğinden de açılır.
   - **Açma ve kapatma:** Araç çubuğunda "Formül" (√x) ya da Alt+= (Word'deki gibi; Türkçe klavyede
     Alt+Shift+0) ile açılır. Enter ya da klavyenin ↵ tuşu formülü ekler.
   - **Düzenleme:** Formüle çift tıklamak ya da seçip Enter'a basmak onu açar. Boşaltılan formül silinir.
     Değişiklik Ctrl+Z ile geri alınır.
   - **Belgede:** Formül satırın içinde, yazının boyutunda durur; her belgede kullanılabilir. Dosyada LaTeX
     olarak saklanır (`formula` düğümü, `latex` özniteliği). Düz metne LaTeX olarak yazılır. Word'e
     aktarırken MathML'e çevrilecek (5. aşama; MathLive bunu yapabiliyor).
   - **Yükleme:** MathLive büyük (sıkıştırılmış 223 KB); yalnız ilk formül görülünce ya da yazılınca yüklenir,
     uygulamanın açılışı yavaşlamaz. Yazı tipleri uygulamanın içinde, internet gerekmez.
   - **Bulunup düzeltilen sorun:** Electron'un PDF'inde sayfanın en üstündeki formülün üssü bir önceki
     sayfanın altına da basılıyordu (yazdırmada formül kendi kutusunun içine boyanır, `contain: paint`).
   - **Arayüz dili:** MathLive'ın arayüzü Türkçe değil. İngilizce menüsü gizlendi; klavyedeki birkaç
     açıklama İngilizce kalır.
2. **Soru bloğu: uygulandı (2026-11-17).**
   - **Sınav ▾ grubu (araç çubuğunda):**
     - Soru ekle: "Çoktan seçmeli soru" (A–E beş şık hazır gelir) ve "Açık uçlu soru".
     - Şıklar: şık ekle / sil (en çok altı, A–F); şıklar alt alta, yan yana ya da iki sütun.
     - Soru: puan, yukarı / aşağı taşıma, silme.
     - Grubun başlığı toplam puanı gösterir.
   - **Soru yapısı:**
     - Kendi bloğudur; metni paragraf, liste, tablo, resim ve formül içerebilir.
     - Numarası (1., 2.…) belgedeki sırasından kendiliğinden gelir, taşıyınca ve silince güncellenir.
     - Puan sağ üstte "(10 puan)" olarak durur.
     - Şık harfleri (A), B)…) kendiliğinden gelir.
     - İmlecin olduğu sorunun solunda ekranda ince mavi bir çizgi var (basılmaz).
   - **Yazarken:**
     - Şıkta Enter sonraki boş şıkka geçer, son şıktan sonra yeni şık açar.
     - Son boş şıkta (ya da altı şık doluyken) Enter sorudan çıkar.
     - Tab / Shift+Tab şıklar arasında gezer.
     - Boş şıkta Backspace şıkkı siler.
     - Soru ekleyince altına bir paragraf konur; boş paragrafta eklenen soru onun yerini alır.
   - **Sayfa bölünmesi:** Sayfa sonuna gelen sorunun ilk satırı numarasıyla birlikte, şık da harfiyle
     birlikte sonraki sayfaya geçer. Yan yana / iki sütunlu şıklar bölünmez.
   - **Yazdırma ve PDF:** Numara, harf ve puan basılır (Electron PDF'inde denendi).
   - **Dosyalar:** Dosyada `question` (`points`), `choices` (`layout`) ve `choice` düğümleri olarak saklanır.
     Düz metne "1. … A) …" olarak yazılır.
3. **Soru bölünmesin, doğru şık, cevap anahtarı: uygulandı (2026-11-17).**
   - **Soru bölünmesin:** Sayfaya sığan soru iki sayfaya bölünmez; sayfa sonuna gelirse bütünüyle sonraki
     sayfaya geçer. Bir sayfadan uzun soru satır satır bölünür. Her soru için böyle; ayrı bir seçenek yok.
   - **Doğru şık (Sınav ▾ → Cevaplar):** İmlecin olduğu şık doğru cevap olarak işaretlenir; sorunun öbür
     şıklarındaki işaret kalkar, aynı şıkta yeniden basınca işaret kalkar. İşaretli şıkkın harfi ekranda
     yeşil halkayla görünür, hiçbir zaman basılmaz.
   - **"Doğru cevapları göster":** Tahtaya yansıtırken işaretler gizlenebilir; seçim cihazda hatırlanır.
     İşaretleyince işaretler kendiliğinden görünür olur.
   - **Cevap anahtarı:** Belgenin sonuna sayfa sonuyla ayrı bir sayfada eklenir: "1. C 2. B 3. —"
     (— açık uçlu soru, ? doğru şıkkı işaretlenmemiş soru). Canlıdır: soru eklenince, taşınınca ya da doğru
     şık değişince kendiliğinden güncellenir. Basılır. İkinci kez istenince yenisi eklenmez, var olana gidilir.
   - **Düz metin:** "Cevap Anahtarı: 1. C, 2. B" satırı.
4. **Sınav kâğıdı şablonu: uygulandı (2026-11-17).** Sınav ▾ → "Sınav kâğıdı…".
   - **Pencere:** Öğretim yılı (kendiliğinden; Eylül'de değişir), okul, sınıf, ders, sınav adı ve öğretmen
     girilir. Bilgiler cihazda hatırlanır; yıl her seferinde bu öğretim yılıdır.
   - **"Yeni sınav kâğıdı":** Kaydedilmemiş değişiklik varsa önce sorar, sonra yeni belge açar. İçinde:
     - Ortada kalın, Türkçe büyük harfle iki satır başlık: "2026-2027 EĞİTİM-ÖĞRETİM YILI … LİSESİ" ve
       "10. SINIF MATEMATİK DERSİ 1. DÖNEM 1. YAZILI SINAVI".
     - Öğrenci tablosu: Adı Soyadı, Numarası, Sınıfı, Puanı.
     - Açıklama satırı ve beş şıklı ilk soru; imleç sorunun içinde bekler.
     - Sonda sağa yaslı "Başarılar dilerim.", öğretmen adı ve "… Öğretmeni".
     - Kenar boşlukları 1,5 cm, altta ortada "1 / 3" biçiminde sayfa numarası.
   - **"Başlığı bu belgeye ekle":** Başlığı ve tabloyu var olan belgenin başına koyar.
   - Hepsi sıradan paragraf ve tablodur; sonradan değiştirilebilir.
   - **Öneri (sonraya):** Okul logosu, birden çok şablon (yazılı, quiz, çalışma kâğıdı).
5. İki sütunlu kâğıt (sayfalamanın sütunlara göre de bölmesi gerekir).
6. A/B kitapçığı, drAW2D/drAW3D ve awPDF'ten görsel ekleme, soru bankası.

## Karşılama (giriş) ekranı (2026-11-17, kullanıcı isteği; henüz kodlanmayacak)

Kullanıcı: awPDF'teki karşılama / giriş ekranı awDOC'a da (ve awCELL'e) eklensin; "henüz kodlama".
awPDF'te bu ekran şöyle: ortada yalnız logo (ad yazısı yok), altında ana iş düğmeleri (ana düğme mavi), en altta
"Son Dosyalar" listesi ve "Listeyi Temizle". Ekran dosya açık değilken görünür (`#emptyState`).
- **Öneri (Claude):** düğmeler **Yeni Belge** (ana düğme), **Aç**; ileride 4. aşamayla **Sınav Kâğıdı** ve 5. aşamayla
  **Word Aç**; altında awDOC'un Son Belgeler listesi (bugün ☰ menüsünde). Bugün awDOC doğrudan boş belgeyle açılıyor:
  ekran açılışta mı gelsin, yoksa yalnız belge kapatılınca mı, karar kullanıcının. Açılıştaki kurtarma kopyası
  sorusu ekranla çakışmamalı.
- Ailede ortak görünüm için awCELL'dekiyle birlikte yapılır.
