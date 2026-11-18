# awDOC

Web, masaüstü ve Android için **kelime işlemci**. Genel kullanım için tam bir kelime işlemci; öne çıkan
yanı öğretmenler için sınav ve çalışma kâğıdı araçları (formül, soru bloğu, sınav şablonu, iki sütun, B kitapçığı).

**mADEMatik Solutions** — [madematik.com](https://madematik.com)

> Durum: planlanan altı aşamanın hepsi bitti (2026-11-18). Web sürümü madematik.com/awDOC/'da; paketler GitHub
> Releases'te. Plan ve kararlar: [docs/yol-haritasi.md](docs/yol-haritasi.md).

## Neler var

- **Sayfa görünümü:** A4 kâğıtlar, sayfa sınırında satır satır bölünme; sürekli görünüm de var. Dikey / yatay
  sayfa, kenar boşlukları, üst bilgi, alt bilgi, sayfa numarası, sayfa sonu (Ctrl+Enter). Yazdırma ve PDF
  ekrandaki sayfaları aynen basar
- **Yazı ve paragraf:** kalın, italik, altı çizili, üstü çizili; yazı tipi, boyut, renk, vurgu; üç başlık düzeyi;
  hizalama, girinti, satır aralığı; madde işaretli ve numaralı liste
- **Ekle:** tablo (hücre birleştirme), resim (seçerek, yapıştırarak, sürükleyerek; yazıyla yerleşim, kırpma,
  şekil yazısı; Android'de kameradan), bağlantı, formül (görsel formül düzenleyici)
- **Öğretmen araçları:** soru bloğu (numara, puan, A–F şıklar alt alta / yan yana / iki sütun), doğru şık ve cevap
  anahtarı, sınav kâğıdı şablonu, yan yana iki soru, **gerçek iki sütunlu kâğıt**, B kitapçığı, soru bankası
- **Başvurular:** içindekiler (sayfa numaralı), dipnot (sayfanın altında), adres-mektup (CSV ya da awCELL
  listesiyle kişiye özel kopyalar)
- **Gözden geçir:** yorumlar, değişiklikleri izleme (kabul / ret)
- **Dosyalar:** awDOC'un kendi `.awd` biçimi; Word `.docx` ve LibreOffice `.odt` açma ve kaydetme; eski Word
  `.doc` bilgisayarda (LibreOffice kuruluysa); düz metin `.txt`; PDF olarak kaydetme
- Bul ve değiştir (Türkçe I/ı/İ/i uyumlu), kelime sayısı, geri al, yinele; Son Belgeler, Otomatik Kaydet;
  kaydedilmemiş iş uygulama kapanırsa bir sonraki açılışta geri istenir; giriş ekranı
- Ortak araç çubuğu stili: açılır gruplar (▾), sığmayanlar ☰ menüsüne; koyu tema, tam ekran, Hakkında
- Akıllı tahtada ekran klavyesi (ETA Klavye ya da Onboard)
- Tamamen yerel çalışır: belge hiçbir sunucuya gönderilmez, internet gerekmez; Android uygulaması izin istemez

## Geliştirme

Node 22 gerekir.

```bash
npm ci
npm run dev              # Vite geliştirme sunucusu
npm test                 # Playwright testleri (127.0.0.1:4176)
npm run test:electron    # masaüstü uygulamasını açıp dener (grafik oturum gerekir)
npm run electron         # masaüstü uygulamasını çalıştırır
npm run build            # tip denetimi + dist/ ve dist-electron/
npm run dist:linux       # AppImage ve .deb (release/)
npm run android:apk      # Android APK
bash scripts/icons.sh    # simgeleri public/img/app-icon.svg'den üretir
```

Paketler (Linux `.deb` / AppImage, Windows `.exe`, Android `.apk`) yalnız GitHub Releases'te yayımlanır;
sürüm etiketi gönderilince GitHub Actions üretir.

## Lisans

MIT
