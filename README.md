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

`index.html` içinde `#indir` bölümünde mağaza bağlantıları:

- **App Store:** `https://apps.apple.com/us/app/%C3%A7%C3%B6p-avc%C4%B1s%C4%B1/id6761179272`
- **Google Play:** `https://play.google.com/store/apps/details?id=com.monovi.copavcisi`

## Hukuki metin

Metinler genel bilgilendirme amaçlıdır; kesin hukuki bağlayıcılık için yerel mevzuata uygun avukat incelemesi önerilir.

## Mağaza şeffaflığı (Google Play)

Politika uyumu için tam açıklamada kullanabileceğiniz canlı kaynak örneği: ana sayfa ve feragatname metni [https://edalganoglu.github.io/CopAvcisiLanding/](https://edalganoglu.github.io/CopAvcisiLanding/) adresindedir. Gerekirse aynı metne işaret eden doğrudan kullanım koşulları: [kullanim-kosullari.html](https://edalganoglu.github.io/CopAvcisiLanding/kullanim-kosullari.html).

## Admin panel

`admin.html` — şifreli kontrol merkezi (dashboard). Navigasyona bağlı değildir; yalnızca doğrudan URL ile erişilir.

- URL: `https://edalganoglu.github.io/CopAvcisiLanding/admin.html`
- Korumayı `admin-reports` Edge Function sağlar; istekler `X-Admin-Password` header'ı ile yollanır.
- Supabase Dashboard → Edge Functions → Secrets bölümünde `ADMIN_PANEL_PASSWORD` tanımlı olmalıdır.
- Kaynak (bakım): [`supabase/functions/admin-reports/index.ts`](supabase/functions/admin-reports/index.ts) — deploy CivicReport projesi (`jxmorcxbzsdsrylrqsbz`), `verify_jwt: false`.

### Sekmeler

| Sekme | Ne yapar |
|--------|-----------|
| **Özet** | KPI’lar (bekleyen / kuyruk / iletildi / iletilemedi / reddedilen), 7–30 gün sayıları, belediye/kullanıcı özeti, son iletilen & bekleyen |
| **Moderasyon** | Bekleyen onay/red + günlük özet e-posta kuyruğu (`list` / `list_queued` / `approve` / `reject`) |
| **Raporlar** | Tüm raporlar; pipeline filtresi (bekliyor / kuyrukta / iletildi / iletilemedi / reddedildi), şehir / arama / UUID, detay drawer (`list_reports` / `get_report`) |
| **Belediyeler** | Arama, opt-out / aktif / e-posta yok filtreleri; e-posta & bildirim güncelleme; yeni belediye; ilçe e-postaları (`list_municipalities` / `update_municipality` / `create_municipality` / `list_district_emails` / `upsert_district_email`) |
| **Kullanıcılar** | `profiles` listesi; rol / tip / belediye ID güncelleme (`list_users` / `update_user`) |

### İletim alanları

- Onay → anlık mail yok; `status=queued_for_dispatch`, günlük `digest-municipality` cron’u gönderir.
- **İletildi:** `email_notify_outcome=sent` (+ genelde `notified_at` dolu). Bounce/open tracking yok.
- **İletilemedi:** `status=not_delivered` veya `skipped_no_recipient` / `skipped_opt_out`.
- Supabase proje referansı `admin.html` içindeki `SUPABASE_URL` sabitinde bakımlıdır.
