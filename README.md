# Çöp Avcısı — Landing

Çöp Avcısı mobil uygulaması için tek sayfalık tanıtım ve yasal metinler (gizlilik politikası, kullanım koşulları, çerez bilgisi, iletişim).

## GitHub Pages

1. GitHub’da repoda **Settings → Pages**.
2. **Build and deployment**: Source **Deploy from a branch**, branch **main**, folder **/ (root)**.
3. Birkaç dakika sonra site adresi genelde `https://edalganoglu.github.io/CopAvcisiLanding/` olur.

**Gizlilik politikası (doğrudan URL):** `https://edalganoglu.github.io/CopAvcisiLanding/gizlilik-politikasi.html`  
**Kullanım koşulları:** `.../kullanim-kosullari.html` · **Çerezler:** `.../cerezler.html` · **İletişim:** `.../iletisim.html`

**Kurumsal ödeme dönüşü (iyzico / derin bağlantı köprüsü):** `https://edalganoglu.github.io/CopAvcisiLanding/billing-return.html`  
Ödeme sağlayıcı veya tarayıcı doğrudan `copavcisi://` şemasını açamıyorsa, Supabase `iyzico-callback` içindeki `IYZICO_SUCCESS_REDIRECT_URL` (ve gerekirse hata yönlendirmesi) bu HTTPS adresine ayarlanır; sayfa sorgu dizesini koruyarak `copavcisi://billing-return?...` yönlendirmesi yapar.

Görseller `assets/` altında uygulama reposundan kopyalanan `logo.png` ve `onboarding-*.png` dosyalarıdır.

## Mağaza linkleri

`index.html` içinde `#indir` bölümündeki App Store ve Google Play bağlantıları şu an `href="#indir"` ve yakında metniyle placeholder. Yayın sonrası gerçek mağaza URL’leriyle değiştirin.

## Hukuki metin

Metinler genel bilgilendirme amaçlıdır; kesin hukuki bağlayıcılık için yerel mevzuata uygun avukat incelemesi önerilir.

## Mağaza şeffaflığı (Google Play)

Politika uyumu için tam açıklamada kullanabileceğiniz canlı kaynak örneği: ana sayfa ve feragatname metni [https://edalganoglu.github.io/CopAvcisiLanding/](https://edalganoglu.github.io/CopAvcisiLanding/) adresindedir. Gerekirse aynı metne işaret eden doğrudan kullanım koşulları: [kullanim-kosullari.html](https://edalganoglu.github.io/CopAvcisiLanding/kullanim-kosullari.html).

## Admin panel

`admin.html` — bekleyen raporları listeleyen, onayla/reddet akışını yöneten statik sayfa. Navigasyona bağlı değildir; yalnızca doğrudan URL ile erişilir.

- URL: `https://edalganoglu.github.io/CopAvcisiLanding/admin.html`
- Korumayı `admin-reports` Edge Function sağlar; istekler `X-Admin-Password` header'ı ile yollanır.
- Supabase Dashboard → Edge Functions → Secrets bölümünde `ADMIN_PANEL_PASSWORD` tanımlı olmalıdır.
- Akış: raporlar mobilden `approval_status='pending'` olarak Supabase'e düşer, panelden **Onayla** dendiğinde `notify-municipality` tetiklenir ve belediyeye Resend üzerinden mail gider. **Reddet** sadece raporu `rejected` olarak işaretler, mail atılmaz.
- Supabase proje referansı `admin.html` içindeki `SUPABASE_URL` sabitinde bakımlıdır; farklı bir projeye bağlanacaksan yalnızca o satırı güncelle.
