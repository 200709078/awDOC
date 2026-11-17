# awDOC

Web, masaüstü ve Android için **kelime işlemci**. Genel kullanım için tam bir kelime işlemci; öne çıkan
yanı öğretmenler için sınav ve çalışma kâğıdı araçları olacak (formül, soru bloğu, sınav şablonu).

**mADEMatik Solutions** — [madematik.com](https://madematik.com)

> Durum: ilk aşama (iskelet). Henüz yayımlanmadı. Plan ve kararlar: [docs/yol-haritasi.md](docs/yol-haritasi.md).

## Şu an olanlar

- Sürekli görünümde (sayfasız) A4 genişliğinde kâğıt; telefonda kâğıt ekranı doldurur
- Kalın, italik, altı çizili, üstü çizili; normal metin ve üç başlık düzeyi; madde işaretli ve numaralı liste;
  sola, ortaya, sağa hizalama ve iki yana yaslama; geri al, yinele
- Yeni, Aç, Kaydet, Farklı Kaydet, Yazdır. "Kaydet" açılan dosyanın üzerine yazar (Chromium tarayıcılarda,
  masaüstünde ve Android'de); yazamadığı yerde nereye kaydedileceğini sorar
- Kaydedilmemiş değişiklik varken başka belgeye geçmeden önce sorar
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
