# awDOC

Web, masaüstü ve Android için **kelime işlemci**. Genel kullanım için tam bir kelime işlemci; öne çıkan
yanı öğretmenler için sınav ve çalışma kâğıdı araçları olacak (formül, soru bloğu, sınav şablonu).

**mADEMatik Solutions** — [madematik.com](https://madematik.com)

> Durum: 3. aşama (A4 sayfa görünümü) bitti; web sürümü madematik.com/awDOC/'da. Paket sürümü henüz yok.
> Plan ve kararlar: [docs/yol-haritasi.md](docs/yol-haritasi.md).

## Şu an olanlar

- **Sayfa görünümü:** A4 kâğıtlar, sayfa sınırında satır satır bölünme; sürekli görünüm de var. Dikey / yatay
  sayfa, kenar boşlukları, üst bilgi, alt bilgi, sayfa numarası, sayfa sonu (Ctrl+Enter). Yazdırma ve PDF
  ekrandaki sayfaları aynen basar
- **Yazı:** kalın, italik, altı çizili, üstü çizili; yazı tipi, boyut, yazı rengi, vurgu; normal metin ve üç
  başlık düzeyi
- **Paragraf:** hizalama, girinti, satır aralığı; madde işaretli ve numaralı liste
- **Ekle:** tablo (satır / sütun ekleme ve silme, hücre birleştirme), resim (seçerek, yapıştırarak, sürükleyerek;
  köşeden boyutlandırma), bağlantı
- Bul ve değiştir (Türkçe I/ı/İ/i uyumlu), kelime sayısı, geri al, yinele
- Yeni, Aç, Kaydet, Farklı Kaydet, Yazdır, PDF Olarak Kaydet, Son Belgeler, Otomatik Kaydet; kaydedilmemiş iş
  uygulama kapanırsa bir sonraki açılışta geri istenir
- Dosyalar: awDOC'un kendi biçimi `.awd` (açma ve kaydetme), düz metin `.txt` (açma)
- Ortak araç çubuğu stili: açılır gruplar (▾), sığmayanlar ☰ menüsüne; koyu tema, tam ekran, Hakkında
- Akıllı tahtada ekran klavyesi (ETA Klavye ya da Onboard)
- Tamamen yerel çalışır: belge hiçbir sunucuya gönderilmez, internet gerekmez

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
