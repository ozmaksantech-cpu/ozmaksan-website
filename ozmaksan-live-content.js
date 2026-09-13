/**
 * ÖZMAKSAN — içerik GitHub'dan gelir; CMS Publish = deploy DEĞİL.
 * Metin + görseller raw.githubusercontent üzerinden güncellenir.
 *
 * Dil desteği: sayfa /en /ru /ar altındaysa, GitHub'dan gelen (kaynağı
 * her zaman Türkçe olan) metin önce content/i18n/cache.<dil>.json içindeki
 * hazır çeviriyle (translate.mjs'in ürettiği önbellek) eşleştirilir; orada
 * yoksa tarayıcıda canlı ve ücretsiz bir çeviri servisiyle (MyMemory / Google)
 * anında çevrilir. Böylece yeni yayınlanan bir ürün/haber, çeviri önbelleği
 * henüz güncellenmemiş olsa bile hiçbir dilde Türkçe kelime bırakmaz.
 */
(function () {
  "use strict";

  var OWNER = "ozmaksantech-cpu";
  var REPO = "ozmaksan-website";
  var BRANCH = "main";
  var SITE_PREFIX = "";
  var RAW =
    "https://raw.githubusercontent.com/" +
    OWNER +
    "/" +
    REPO +
    "/" +
    BRANCH +
    "/" +
    SITE_PREFIX;
  var CONTENT = RAW + "content";

  function currentLocale() {
    var m = location.pathname.match(/^\/(en|ru|ar)(?:\/|$)/);
    return m ? m[1] : "tr";
  }
  var LOCALE = currentLocale();

  function bust(url) {
    return url + (url.indexOf("?") >= 0 ? "&" : "?") + "t=" + Date.now();
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function mdInline(s) {
    var t = esc(s);
    t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    t = t.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
    return t;
  }

  function assetUrl(p) {
    if (!p) return "";
    var s = String(p);
    if (/^https?:\/\//i.test(s)) return s;
    s = s.replace(/^\/+/, "").replace(/^\.\.\//, "");
    return RAW + s;
  }

  function introHtml(intro) {
    var parts = [];
    if (typeof intro === "string") {
      parts = intro.split(/\n\s*\n/).map(function (x) { return x.trim(); }).filter(Boolean);
    } else if (Array.isArray(intro)) {
      parts = intro
        .map(function (x) {
          if (x && typeof x === "object") return String(x.paragraph || x.p || x.text || "");
          return String(x || "");
        })
        .filter(Boolean);
    }
    return parts.map(function (p) { return "<p>" + mdInline(p) + "</p>"; }).join("");
  }

  function featuresHtml(features) {
    var lines = [];
    if (typeof features === "string") {
      lines = features.split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean);
    } else if (Array.isArray(features)) {
      lines = features
        .map(function (x) {
          if (x && typeof x === "object") return String(x.feature || x.f || x.text || "");
          return String(x || "");
        })
        .filter(Boolean);
    }
    return lines.map(function (f) { return "<li><span>" + mdInline(f) + "</span></li>"; }).join("");
  }

  function bodyHtml(body) {
    var s = String(body || "").trim();
    if (!s) return "";
    if (/\n\s*\n/.test(s) || /\*\*/.test(s)) {
      return s
        .split(/\n\s*\n/)
        .map(function (p) { return p.trim(); })
        .filter(Boolean)
        .map(function (p) { return "<p>" + mdInline(p.replace(/\n/g, " ")) + "</p>"; })
        .join("");
    }
    return s
      .split(/(?<=[.!?])\s+/)
      .filter(Boolean)
      .map(function (p) { return "<p>" + mdInline(p) + "</p>"; })
      .join("");
  }

  function fetchJson(url) {
    return fetch(bust(url), { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    });
  }

  /* ---- Canlı çeviri (dil TR değilse) ---- */

  var i18nCachePromises = {};
  function getI18nCache(lang) {
    if (!i18nCachePromises[lang]) {
      i18nCachePromises[lang] = fetchJson(CONTENT + "/i18n/cache." + lang + ".json").catch(function () {
        return {};
      });
    }
    return i18nCachePromises[lang];
  }

  function sha256Hex16(str) {
    if (!window.crypto || !window.crypto.subtle || !window.TextEncoder) {
      return Promise.resolve(null);
    }
    try {
      var data = new TextEncoder().encode(str);
      return window.crypto.subtle
        .digest("SHA-256", data)
        .then(function (buf) {
          var bytes = new Uint8Array(buf);
          var hex = "";
          for (var i = 0; i < bytes.length; i++) {
            hex += bytes[i].toString(16).padStart(2, "0");
          }
          return hex.slice(0, 16);
        })
        .catch(function () { return null; });
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  function myMemoryTranslate(text, lang) {
    var url =
      "https://api.mymemory.translated.net/get?q=" +
      encodeURIComponent(text) +
      "&langpair=tr|" +
      lang;
    return fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var out = d && d.responseData && d.responseData.translatedText;
        if (!out || out === text || /MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(out)) return null;
        return out;
      })
      .catch(function () { return null; });
  }

  function googleTranslateFree(text, lang) {
    var url =
      "https://translate.googleapis.com/translate_a/single?client=gtx&sl=tr&tl=" +
      lang +
      "&dt=t&q=" +
      encodeURIComponent(text);
    return fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (Array.isArray(data) && Array.isArray(data[0])) {
          return data[0].map(function (p) { return p[0]; }).join("");
        }
        return null;
      })
      .catch(function () { return null; });
  }

  function liveTranslate(text, lang) {
    return myMemoryTranslate(text, lang).then(function (out) {
      if (out) return out;
      return googleTranslateFree(text, lang);
    });
  }

  function skipTranslate(text) {
    var t = String(text == null ? "" : text).trim();
    if (!t) return true;
    if (/^[\d\s+().\-–—%°/,]+$/.test(t)) return true;
    if (/^https?:\/\//i.test(t)) return true;
    return false;
  }

  var translateMemo = {};
  function translateText(text, lang) {
    if (!lang || lang === "tr" || skipTranslate(text)) return Promise.resolve(text);
    var memoKey = lang + "::" + text;
    if (translateMemo[memoKey]) return translateMemo[memoKey];

    var p = sha256Hex16(text)
      .then(function (hash) {
        return getI18nCache(lang).then(function (cache) {
          var cached = hash && cache ? cache[hash] : null;
          if (cached) return cached;
          return liveTranslate(text, lang).then(function (out) { return out || text; });
        });
      })
      .catch(function () { return text; });

    translateMemo[memoKey] = p;
    return p;
  }

  /* ---- DOM güncelleme ---- */

  function applyProduct(root, data) {
    var nameEl = root.querySelector("[data-live='name']");
    var taglineEl = root.querySelector("[data-live='tagline']");
    var introEl = root.querySelector("[data-live='intro']");
    var featuresEl = root.querySelector("[data-live='features']");

    return Promise.all([
      data.name ? translateText(data.name, LOCALE) : Promise.resolve(null),
      data.tagline != null ? translateText(data.tagline, LOCALE) : Promise.resolve(null),
      data.intro != null ? translateText(data.intro, LOCALE) : Promise.resolve(null),
      data.features != null ? translateText(data.features, LOCALE) : Promise.resolve(null),
    ]).then(function (res) {
      var name = res[0], tagline = res[1], intro = res[2], features = res[3];
      if (nameEl && name) nameEl.textContent = name;
      if (taglineEl && tagline != null) taglineEl.textContent = tagline;
      if (introEl && intro != null) introEl.innerHTML = introHtml(intro);
      if (featuresEl && features != null) {
        var html = featuresHtml(features);
        if (html) featuresEl.innerHTML = html;
      }
      if (data.image) {
        root.querySelectorAll(".product-hero-media img, .gallery-slide img").forEach(function (img, i) {
          if (i === 0) img.src = assetUrl(data.image);
        });
      }
    });
  }

  function applyNews(root, data) {
    var titleEl = root.querySelector("[data-live='title']");
    var bodyEl = root.querySelector("[data-live='body']");

    return Promise.all([
      data.title ? translateText(data.title, LOCALE) : Promise.resolve(null),
      data.body != null ? translateText(data.body, LOCALE) : Promise.resolve(null),
    ]).then(function (res) {
      var title = res[0], body = res[1];
      if (titleEl && title) titleEl.textContent = title;
      if (bodyEl && body != null) bodyEl.innerHTML = bodyHtml(body);
      if (data.image) {
        var img = root.querySelector(".news-detail-figure img, .gallery-slide img");
        if (img) img.src = assetUrl(data.image);
      }
    });
  }

  function applyCard(el, item, kind) {
    if (!item) return;
    var titleEl = el.querySelector("h3 a, h3");
    var pEl = el.querySelector("p");
    var img = el.querySelector("img");
    var titleText = kind === "product" ? item.name : item.title;
    var descText = kind === "product" ? item.tagline : item.excerpt;

    Promise.all([
      titleText ? translateText(titleText, LOCALE) : Promise.resolve(null),
      descText != null ? translateText(descText, LOCALE) : Promise.resolve(null),
    ]).then(function (res) {
      var title = res[0], desc = res[1];
      if (titleEl && title) titleEl.textContent = title;
      if (pEl && desc != null) {
        if (kind === "product") pEl.textContent = desc;
        else pEl.innerHTML = mdInline(desc);
      }
      if (img && item.image) img.src = assetUrl(item.image);
    });
  }

  /* Görseller CDN'de yoksa GitHub'dan dene */
  document.addEventListener(
    "error",
    function (e) {
      var t = e.target;
      if (!t || t.tagName !== "IMG" || t.dataset.ghTried) return;
      var src = t.getAttribute("src") || "";
      if (!src || /raw\.githubusercontent\.com/i.test(src)) return;
      t.dataset.ghTried = "1";
      var clean = src.replace(/^https?:\/\/[^/]+\//, "").replace(/^\.\.\//, "").replace(/^\/+/, "");
      if (clean.indexOf("assets/") === 0) {
        t.src = assetUrl(clean);
      } else if (clean) {
        t.src = assetUrl(clean);
      }
    },
    true,
  );

  var productRoot = document.querySelector("[data-live-product]");
  if (productRoot) {
    fetchJson(CONTENT + "/products/" + encodeURIComponent(productRoot.getAttribute("data-live-product")) + ".json")
      .then(function (data) { return applyProduct(productRoot, data); })
      .catch(function () {});
  }

  var newsRoot = document.querySelector("[data-live-news]");
  if (newsRoot) {
    fetchJson(CONTENT + "/news/" + encodeURIComponent(newsRoot.getAttribute("data-live-news")) + ".json")
      .then(function (data) { return applyNews(newsRoot, data); })
      .catch(function () {});
  }

  var needCatalog =
    document.querySelector("[data-product-slug], [data-news-slug], [data-live-catalog]");
  if (needCatalog) {
    fetchJson(CONTENT + "/catalog.json")
      .then(function (cat) {
        var byProduct = {};
        (cat.products || []).forEach(function (p) { if (p.slug) byProduct[p.slug] = p; });
        var byNews = {};
        (cat.news || []).forEach(function (n) { if (n.slug) byNews[n.slug] = n; });
        document.querySelectorAll("[data-product-slug]").forEach(function (el) {
          applyCard(el, byProduct[el.getAttribute("data-product-slug")], "product");
        });
        document.querySelectorAll("[data-news-slug]").forEach(function (el) {
          applyCard(el, byNews[el.getAttribute("data-news-slug")], "news");
        });
      })
      .catch(function () {});
  }

  /* Jenerik site.json metni: <p data-live-site="about.intro.0">...</p> */
  var siteLiveNodes = document.querySelectorAll("[data-live-site]");
  if (LOCALE !== "tr" && siteLiveNodes.length) {
    fetchJson(CONTENT + "/site.json")
      .then(function (site) {
        siteLiveNodes.forEach(function (el) {
          var value = el
            .getAttribute("data-live-site")
            .split(".")
            .reduce(function (acc, key) { return acc && acc[key] !== undefined ? acc[key] : undefined; }, site);
          if (value == null) return;
          translateText(String(value), LOCALE).then(function (translated) {
            el.innerHTML = mdInline(translated);
          });
        });
      })
      .catch(function () {});
  }
})();
