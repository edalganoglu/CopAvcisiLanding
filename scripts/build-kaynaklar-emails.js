const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const jsonPath = path.join(root, "municipalities_rows.json");
const d = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** E-posta adresinden yalnızca alan adı (domain); @ ve sol taraf atılır. */
function domainFromEmail(email) {
  const s = String(email).trim();
  const i = s.indexOf("@");
  return i === -1 ? s : s.slice(i + 1);
}

/**
 * Bazı resmî siteler yalnızca www alt alanında yayınlanır; düz alan adı açılmaz.
 * Gerekirse bu kümeye alan adı ekleyin (küçük harf).
 */
const DOMAINS_NEED_WWW = new Set(["adana.bel.tr", "evciler.bel.tr"]);

/** www + kök dışı yol (ör. /index.html); yalnızca DOMAINS_NEED_WWW ile birlikte kullanılır. */
const WWW_DOMAIN_PATHS = {
  "evciler.bel.tr": "/index.html",
};

/**
 * E-posta alanı KEP (ör. hs01.kep.tr) iken gerçek belediye web sitesi elle eşlenir.
 * Anahtar: municipalities_rows.json içindeki tam `name` değeri.
 */
const SITE_DOMAIN_OVERRIDES = {
  "Diyarbakır — Bismil": "bismil.bel.tr",
  "Diyarbakır — Ergani": "ergani.bel.tr",
  "Diyarbakır — Kulp": "kulp.bel.tr",
  "Diyarbakır — Lice": "lice.bel.tr",
  "Diyarbakır — Silvan": "silvan.bel.tr",
  "Diyarbakır Büyükşehir Belediyesi": "diyarbakir.bel.tr",
  "Gaziantep — Şahinbey": "sahinbey.bel.tr",
  "İstanbul — Büyükçekmece": "bcekmece.bel.tr",
  "İstanbul — Eyüpsultan": "eyupsultan.bel.tr",
  "İzmir — Ödemiş": "odemis.bel.tr",
  "Karabük — Eskipazar": "eskipazar.bel.tr",
  "Karabük — Merkez": "karabuk.bel.tr",
  "Karabük — Ovacık": "ovacik.bel.tr",
  "Karabük — Yenice": "yenice.bel.tr",
  "Karabük Büyükşehir Belediyesi": "karabuk.bel.tr",
  "Kayseri — Melikgazi": "melikgazi.bel.tr",
  "Kocaeli — Dilovası": "dilovasi.bel.tr",
  "Konya — Akören": "akoren.bel.tr",
  "Konya — Beyşehir": "beysehir.bel.tr",
  "Konya — Çeltik": "celtik.bel.tr",
  "Konya — Çumra": "cumra.bel.tr",
  "Konya — Derbent": "derbent.bel.tr",
  "Konya — Güneysınır": "guneysinir.bel.tr",
  "Konya — Hadim": "hadim.bel.tr",
  "Konya — Hüyük": "huyuk.bel.tr",
  "Konya — Kadınhanı": "kadinhani.bel.tr",
  "Konya — Tuzlukçu": "tuzlukcu.bel.tr",
  "Konya Büyükşehir Belediyesi": "konya.bel.tr",
  "Niğde — Altunhisar": "altunhisar.bel.tr",
  "Niğde — Bor": "bor.bel.tr",
  "Niğde — Merkez": "nigde.bel.tr",
  "Niğde — Ulukışla": "ulukisla.bel.tr",
  "Niğde Büyükşehir Belediyesi": "nigde.bel.tr",
  "Ordu — Ünye": "unye.bel.tr",
  "Osmaniye — Kadirli": "kadirli.bel.tr",
  "Sakarya — Akyazı": "akyazi.bel.tr",
  "Sakarya — Karasu": "karasu.bel.tr",
  "Sakarya — Serdivan": "serdivan.bel.tr",
  "Sakarya — Söğütlü": "sogutlu.bel.tr",
  "Sakarya Büyükşehir Belediyesi": "sakarya.bel.tr",
  "Tunceli — Çemişgezek": "cemisgezek.bel.tr",
  "Tunceli — Mazgirt": "mazgirt.bel.tr",
  "Tunceli — Merkez": "tunceli.bel.tr",
  "Tunceli — Pertek": "pertek.bel.tr",
  "Tunceli — Pülümür": "pulumur.bel.tr",
  "Tunceli Büyükşehir Belediyesi": "tunceli.bel.tr",
  "Zonguldak — Çaycuma": "caycuma.bel.tr",

  // Gmail / Hotmail → resmî .bel.tr
  "Afyonkarahisar — Evciler": "evciler.bel.tr",
  "Aksaray — Ağaçören": "agacoren.bel.tr",
  "Ardahan — Çıldır": "cildir.bel.tr",
  "Batman — Gercüş": "gercus.bel.tr",
  "Bitlis — Ahlat": "ahlat.bel.tr",
  "Burdur — Altınyayla": "altinyayla.bel.tr",
  "Bursa — Harmancık": "harmancik.bel.tr",
  "Çanakkale — Gökçeada": "gokceada.bel.tr",
  "Çankırı — Atkaracalar": "atkaracalar.bel.tr",
  "Çankırı — Orta": "orta.bel.tr",
  "Çorum — Kargı": "kargi.bel.tr",
  "Denizli — Çal": "cal.bel.tr",
  "Denizli — Sarayköy": "saraykoy.bel.tr",
  "Edirne — Havsa": "havsa.bel.tr",
  "Edirne — Lalapaşa": "lalapasa.bel.tr",
  "Eskişehir — Alpu": "alpu.bel.tr",
  "Eskişehir — Çifteler": "cifteler.bel.tr",
  "Giresun — Yağlıdere": "yaglidere.bel.tr",
  "Isparta — Keçiborlu": "keciborlu.bel.tr",
  "Karabük — Eflani": "eflani.bel.tr",
  "Karaman — Ermenek": "ermenek.bel.tr",
  "Karaman — Sarıveliler": "sariveliler.bel.tr",
  "Kastamonu — Seydiler": "seydiler.bel.tr",
  "Konya — Derebucak": "derebucak.bel.tr",
  "Konya — Halkapınar": "halkapinar.bel.tr",
  "Konya — Taşkent": "taskent.bel.tr",
  "Konya — Yalıhüyük": "yalihuyuk.bel.tr",
  "Malatya — Arguvan": "arguvan.bel.tr",
  "Malatya — Hekimhan": "hekimhan.bel.tr",
  "Mersin — Anamur": "anamur.bel.tr",
  "Mersin — Çamlıyayla": "camliyayla.bel.tr",
  "Muş — Malazgirt": "malazgirt.bel.tr",
  "Muş — Varto": "varto.bel.tr",
  "Niğde — Çamardı": "camardi.bel.tr",
  "Sinop — Türkeli": "turkeli.bel.tr",
  "Şırnak — Güçlükonak": "guclukonak.bel.tr",
  "Tunceli — Hozat": "hozat.bel.tr",
};

/** href ve görünen metin (liste için). */
function siteLinkFromDomain(domain) {
  const d = String(domain).trim().toLowerCase();
  if (DOMAINS_NEED_WWW.has(d)) {
    const host = `www.${d}`;
    const path = WWW_DOMAIN_PATHS[d];
    const href = path
      ? `https://${host}${path}`
      : `https://${host}/`;
    return { href, label: host };
  }
  return { href: `https://${d}/`, label: d };
}

function resolveSiteDomain(name, email) {
  const o = SITE_DOMAIN_OVERRIDES[name];
  if (o) return o;
  return domainFromEmail(email);
}

const withEmail = d
  .filter((x) => x.email && String(x.email).trim())
  .sort((a, b) => a.name.localeCompare(b.name, "tr"));

const lines = withEmail.map((x) => {
  const n = esc(x.name);
  const domain = resolveSiteDomain(x.name, x.email);
  const { href, label } = siteLinkFromDomain(domain);
  const hrefEsc = esc(href);
  const labelEsc = esc(label);
  const link = `<a class="text-primary font-medium underline link-inline decoration-primary/40 break-all" href="${hrefEsc}" rel="noopener noreferrer">${labelEsc}</a>`;
  return `<li><span class="font-medium text-on-surface">${n}</span> — ${link}</li>`;
});

const withoutEmail = d.length - withEmail.length;
const html = `
<h2 class="text-xl font-bold text-on-surface pt-5">Belediye e-posta adresleri</h2>
<p class="text-sm text-slate-600 dark:text-slate-400">Aşağıdaki liste, <strong class="text-on-surface">${withEmail.length}</strong> belediye için uygulama veri tabanında kayıtlı iletişim e-postasının <strong class="text-on-surface">alan adı</strong> (web sitesi) kısmını gösterir (${d.length} kayıttan <strong class="text-on-surface">${withoutEmail}</strong> tanesinde e-posta alanı boş). Güncel ve bağlayıcı bilgi için ilgili belediyenin resmî web sitesini esas alın.</p>
<p class="text-sm text-slate-600 dark:text-slate-400 mb-3">İlgili belediyeler için güncel ve bağlayıcı bilgide <strong class="text-on-surface">aşağıdaki resmî web sitelerini</strong> esas alın.</p>
<ul class="list-none pl-0 space-y-2 text-[14px] md:text-[15px] max-h-[70vh] overflow-y-auto border border-slate-200 dark:border-slate-600 rounded-2xl p-4 md:p-5 bg-slate-50/80 dark:bg-slate-900/40">
${lines.join("\n")}
</ul>
`;

console.log("municipalities with email", lines.length);

const indexPath = path.join(root, "kaynaklar", "index.html");
let indexHtml = fs.readFileSync(indexPath, "utf8");
const needle =
  '\n\n<section class="pt-8 mt-8 border-t border-slate-200 dark:border-slate-700" lang="en"';
if (indexHtml.includes("Belediye e-posta adresleri")) {
  const start = indexHtml.indexOf(
    '\n\n<h2 class="text-xl font-bold text-on-surface pt-5">Belediye e-posta adresleri</h2>'
  );
  const end = indexHtml.indexOf(needle, start);
  if (start !== -1 && end !== -1) {
    indexHtml = indexHtml.slice(0, start) + indexHtml.slice(end);
  }
}
const pos = indexHtml.indexOf(needle);
if (pos === -1) {
  console.error("Could not find insertion point in index.html");
  process.exit(1);
}
indexHtml =
  indexHtml.slice(0, pos) + "\n\n" + html.trim() + indexHtml.slice(pos);
const htmlEnd = indexHtml.indexOf("</html>");
if (htmlEnd !== -1 && htmlEnd + 7 < indexHtml.length) {
  indexHtml = indexHtml.slice(0, htmlEnd + 7);
}
fs.writeFileSync(indexPath, indexHtml, "utf8");
console.log("updated", indexPath);
