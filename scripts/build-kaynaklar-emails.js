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
const DOMAINS_NEED_WWW = new Set(["adana.bel.tr"]);

/** href ve görünen metin (liste için). */
function siteLinkFromDomain(domain) {
  const d = String(domain).trim().toLowerCase();
  if (DOMAINS_NEED_WWW.has(d)) {
    const host = `www.${d}`;
    return { href: `https://${host}/`, label: host };
  }
  return { href: `https://${d}/`, label: d };
}

const withEmail = d
  .filter((x) => x.email && String(x.email).trim())
  .sort((a, b) => a.name.localeCompare(b.name, "tr"));

const lines = withEmail.map((x) => {
  const n = esc(x.name);
  const domain = domainFromEmail(x.email);
  const { href, label } = siteLinkFromDomain(domain);
  const hrefEsc = esc(href);
  const labelEsc = esc(label);
  return (
    `<li><span class="font-medium text-on-surface">${n}</span> — <a class="text-primary font-medium underline link-inline decoration-primary/40 break-all" href="${hrefEsc}" rel="noopener noreferrer">${labelEsc}</a></li>`
  );
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
