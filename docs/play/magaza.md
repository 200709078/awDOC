# awDOC — Google Play mağaza kaydı

Play Console'a girilecek metinler ve görseller. Görseller `npm run play:gorseller` ile yeniden üretilir
(uygulamanın görünüşü değişince). Sınırlar Play'in sınırlarıdır; `npm run play:sinirlar` metinlerin sığdığını denetler.

## Ayrıntılar

- **Uygulama adı** (en çok 30 karakter):

<!-- ad -->
awDOC: Kelime İşlemci
<!-- /ad -->

- **Kısa açıklama** (en çok 80 karakter):

<!-- kisa -->
Sınav kâğıdı, formül ve soru araçlı, reklamsız kelime işlemci. Word ile uyumlu.
<!-- /kisa -->

- **Tam açıklama** (en çok 4000 karakter):

<!-- tam -->
awDOC, telefonda, tablette, bilgisayarda ve sınıftaki akıllı tahtada kullanılmak için tasarlanmış bir kelime işlemcidir. Her türlü yazı için tam bir kelime işlemci; öğretmenler için de sınav ve çalışma kâğıdı hazırlamayı kolaylaştıran araçları vardır. Reklam yoktur, hesap istemez, hiçbir veri toplamaz.

• Sınav kâğıdı şablonu: okul, ders, sınıf ve sınav bilgileriyle başlık ve öğrenci tablosu tek dokunuşla hazır; istenirse sorular iki sütunda.
• Soru blokları: otomatik numara, puan, A–F şıkları alt alta, yan yana ya da iki sütun; doğru şıkkı işaretleyin, cevap anahtarı kendiliğinden oluşsun.
• B kitapçığı: soruların ve şıkların sırası karıştırılmış ikinci kâğıt, kendi cevap anahtarıyla.
• Soru bankası: soruları konularıyla saklayın, yeni kâğıtlara ekleyin.
• Formül düzenleyici: kesir, üs, kök, mutlak değer, vektör ve daha fazlası; matematik klavyesiyle.
• Adres-mektup: öğrenci listesiyle (CSV ya da awCELL tablosu) her öğrenciye adı yazılı ayrı kâğıt ya da veli mektubu.
• Sayfa görünümü: A4 sayfalar, kenar boşlukları, üst ve alt bilgi, sayfa numarası, dikey ve yatay sayfa; yazdırma ve PDF ekrandaki gibi.
• Biçimlendirme: yazı tipi, boyut, renk, vurgu, başlıklar, hizalama, satır aralığı, girinti, madde ve numaralı listeler, tablolar.
• Resimler: galeriden, yapıştırarak ya da doğrudan kameradan; kırpma, yazıyla yan yana yerleşim, şekil yazısı.
• İçindekiler, dipnot, yorumlar ve değişiklikleri izleme.
• Word ve LibreOffice ile uyumlu: .docx ve .odt dosyalarını açar ve kaydeder; PDF olarak kaydeder, yazdırır.
• Bul ve değiştir (Türkçe harflerle uyumlu), kelime sayısı, otomatik kaydetme; kaydedilmemiş çalışmanız kaybolmaz.

Gizliliğiniz önce gelir
Belgeleriniz yalnızca cihazınızda işlenir; hiçbir dosya internete ya da bir sunucuya gönderilmez. Uygulama hiçbir izin istemez, internet izni bile yoktur. Kameradan resim eklerken fotoğrafı telefonunuzun kendi kamera uygulaması çeker.

Her yerde aynı uygulama
awDOC'un Linux (Pardus dahil) ve Windows sürümleri ile tarayıcıda çalışan web sürümü de vardır: madematik.com/awDOC

awDOC ücretsizdir. Öneri ve sorunlar için: destek@madematik.com
<!-- /tam -->

## Kategori ve iletişim

- **Uygulama mı, oyun mu:** Uygulama
- **Ücretli mi, ücretsiz mi:** Ücretsiz
- **Kategori:** Verimlilik
- **Etiketler (öneri):** Verimlilik, Eğitim, İş, Araçlar (Play'in listesinden en yakınları seçilir).
- **E-posta (herkese açık):** destek@madematik.com
- **Web sitesi:** https://madematik.com
- **Telefon:** boş bırakılır (isteğe bağlı).
- **Gizlilik politikası:** https://madematik.com/awDOC/gizlilik.html (kaynağı `public/gizlilik.html`)

## Uygulama içeriği beyanları (öneri; awPDF'te verilen cevaplarla aynı mantık)

- **Veri güvenliği:** Veri toplanmıyor, paylaşılmıyor. Uygulama izin istemez, internet izni yoktur.
- **Reklam:** Reklam yok.
- **Uygulama erişimi:** Bütün işlevler herhangi bir giriş olmadan kullanılabilir.
- **İçerik derecelendirmesi:** Anket "araç / verimlilik" uygulaması olarak doldurulur; şiddet, kumar, kullanıcılar arası
  iletişim yok.
- **Hedef kitle:** awPDF'te seçilenle aynı yaş grupları.
- **Satıcı statüsü:** Hesap düzeyinde "tacir değil" olarak zaten beyan edildi (2026-11-07, awPDF).
- **Yapay zekâ beyanı:** awPDF'te seçilenle aynı.
- **Uygulama imzalama:** İlk AAB'den önce Uygulama bütünlüğü → Uygulama imzalama → "Bu geliştirici hesabındaki başka bir
  uygulamayla aynı anahtarı kullan" → awPDF (SHA-256 `84:F7:8D:F0…` olmalı).

## Sürüm notları ("Bu sürümdeki yenilikler", en çok 500 karakter)

Play Console'da sürüm oluşturulurken `<tr-TR>` ile `</tr-TR>` arasına yazılır. En yenisi üstte.

### 0.1.0

<!-- not-0.1.0 -->
Google Play'deki ilk sürüm. Öğretmen dostu kelime işlemci: sınav kâğıdı şablonu, soru blokları ve cevap anahtarı, iki sütunlu kâğıt, B kitapçığı, soru bankası, formül düzenleyici, adres-mektup. Word ve LibreOffice dosyalarını açar ve kaydeder, PDF olarak kaydeder. Reklam yok, hiçbir veri toplanmaz.
<!-- /not-0.1.0 -->

## Görseller (`docs/play/`)

- `simge-512.png` — uygulama simgesi (512×512)
- `one-cikan-1024x500.png` — öne çıkan görsel
- `ekran/telefon-*.png`, `ekran/tablet7-*.png`, `ekran/tablet10-*.png` — telefon, 7" ve 10" tablet ekran görüntüleri
  (sınav kâğıdı, Sınav ▾ araçları, formül düzenleyici, Başvurular ▾)
