/**
 * Provider: PelisForte (Películas y Series en Latino, Castellano y Sub)
 * Dominio: https://www2.pelisforte.se
 * Reemplazo oficial de PelisPlus
 * Motor: 100% Cadenas de Promesas (Hermes / FireTV / QuickJS / NuvioTV Safe)
 * Características: Doblajes originales de cine (OK.ru CDN 1080p/720p Directo), StreamWish (playerwish), VidHide y Filemoon.
 * Reglas Hermes: ES5 estricto, timeouts en headers Y body, cero AbortController, cero dependencias.
 *
 * Cambios v1.1-NUVIOTV (2026-11) - capa runtime portada de jkanime v2.9 / sololatino v2.0:
 *  1) FIX CRITICO DE TV: el QuickJS de NuvioTV (dokar quickjs-kt + polyfill de
 *     PluginRuntime.kt) NO define setTimeout/clearTimeout. La v1.0 los usaba sin
 *     condition en fetchWithTimeout/textWithTimeout -> cada fetch rechazaba al
 *     instante y el provider devolvia [] SOLO en TV (en PC/Hermes funcionaba).
 *     Ahora HAS_TIMER detecta el runtime: con timer se conserva el timeout por
 *     llamada; sin timer (TV) fetch directo apoyado en el corte real de OkHttp.
 *  2) PRESUPUESTO GLOBAL Date.now() de 45s (el runtime mata el plugin a los 60s):
 *     cada fetch verifica tvRemaining() y se cancela con null si queda < 400ms.
 *     El plazo de 9s propio del provider (GLOBAL_DEADLINE_MS) se conserva para
 *     saltarse probes cuando la cadena ya viene lenta.
 *  3) PUENTE __native_fetch: try/catch sincrono y fallos de red/timeout resuelven
 *     null (todos los call sites ya toleran null via isResOk / if (!res)).
 *  4) BYSE EXPLICITO: el gateway mp4.nu hoy manda la mayoria de opciones a
 *     byseraguci.com (player SPA con "fingerprint attestation" antes del
 *     playback -> no extraible en ES5). Se detecta post-gateway y se salta sin
 *     gastar mas peticiones (antes solo se filtraba por texto del boton, que el
 *     sitio ya no pone: los botones dicen "OPCION N" sin nombre de servidor).
 *  5) DIAGNOSTICO: rastro por console.error (NuvioTV/FireOS silencia console.log)
 *     + contrato garantizado: getStreams SIEMPRE devuelve una Promesa -> Array.
 *  6) LOGICA DE SCRAPING INTACTA (v1.0): busqueda /?s=, scoring por slug (umbral
 *     35), patron de episodios (NxE / SxE / temporada-episodio), parseo de
 *     opciones (options-N + lnN + tokens mp4.nu), gateway r.php, OK.ru
 *     (data-options), StreamWish/VidHide/Filemoon, cache TTL 10 min.
 *     NOTA (2026-11): OK.ru retiro data-options de sus embeds (player solo-JS) y
 *     Cloudflare desafia clientes Node (undici) en www2.pelisforte.se; en la app
 *     (OkHttp) la primera peticion puede pasar o no segun la configuracion del
 *     WAF. Si el sitio re-agrega servidores StreamWish/VidHide, este provider
 *     los resuelve sin cambios.
 */

var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var BASE_URL = "https://www2.pelisforte.se";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var NETWORK_TIMEOUT = 2500;
var SCORE_THRESHOLD = 35;
var GLOBAL_DEADLINE_MS = 9000;
var CACHE_TTL_MS = 10 * 60 * 1000;
var DEBUG = false;

var DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-MX,es;q=0.9,en;q=0.8",
    "Referer": BASE_URL + "/"
};

var WISH_HOSTS = ["streamwish", "playerwish", "strwish", "flaswish", "hlswish", "hglink", "hanerix", "hgcloud", "vibuxer"];
var VIDHIDE_HOSTS = ["vidhide", "morencius", "callistanise", "minochinos"];

var CACHE = {};
var REQUEST_T0 = 0;

var LOG_TAG = "[PelisForte][v1.1]";

// ==========================================
// 1. HELPERS DE RED, STRINGS Y TIEMPOS (HERMES / QUICKJS SAFE)
// En NuvioTV (QuickJS) NO existe setTimeout: OkHttp ya corta cada peticion
// (30s connect / 30s read) y el runtime mata el plugin a los 60s.
// ==========================================

var HAS_TIMER = (typeof setTimeout === "function");
var GLOBAL_BUDGET_MS = 45000;
var START_TS = 0;

function tvNow() {
    try { return Date.now(); } catch (e2) { return 0; }
}

function tvElapsed() {
    if (!START_TS) return 0;
    return tvNow() - START_TS;
}

function tvRemaining() {
    var left = GLOBAL_BUDGET_MS - tvElapsed();
    return (left > 0) ? left : 0;
}

function logDiag(msg) {
    try { console.error(LOG_TAG + " " + msg); } catch (eLog) {}
}

function dbg() {
    if (!DEBUG) return;
    try {
        console.log("[PelisForte] " + Array.prototype.join.call(arguments, " "));
    } catch (e) {}
}

function isResOk(res) {
    if (!res) return false;
    if (res.ok === true) return true;
    return typeof res.status === "number" && res.status >= 200 && res.status < 300;
}

function fetchWithTimeout(url, options, timeoutMs) {
    if (tvRemaining() < 400) {
        logDiag("presupuesto agotado, fetch cancelado: " + url);
        return Promise.resolve(null);
    }

    var fetchPromise = null;
    try {
        fetchPromise = fetch(url, options || {});
        if (!fetchPromise || typeof fetchPromise.then !== "function") {
            fetchPromise = Promise.reject(new Error("fetch sin promesa"));
        }
    } catch (eSync) {
        return Promise.resolve(null);
    }

    if (!HAS_TIMER) {
        // NuvioTV: sin timer JS posible. OkHttp (30s/30s) es el limite real.
        return fetchPromise
            .then(function(res) { return res; })
            .catch(function() { return null; });
    }

    var limit = timeoutMs || NETWORK_TIMEOUT;
    if (limit > tvRemaining()) limit = tvRemaining();

    return fetchPromise
        .then(function(res) { return res; })
        .catch(function() { return null; });
}

function textWithTimeout(res, timeoutMs) {
    if (!res || typeof res.text !== "function") return Promise.resolve(null);
    if (!HAS_TIMER) {
        try {
            return res.text().then(function(t) { return t; }).catch(function() { return null; });
        } catch (e3) {
            return Promise.resolve(null);
        }
    }
    var limit = timeoutMs || NETWORK_TIMEOUT;
    return new Promise(function(resolve, reject) {
        var settled = false;
        var timer = setTimeout(function() {
            if (!settled) {
                settled = true;
                reject(new Error("Timeout de body tras " + limit + "ms"));
            }
        }, limit);
        try {
            res.text().then(function(txt) {
                if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    resolve(txt);
                }
            }).catch(function(err) {
                if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    reject(err);
                }
            });
        } catch (e) {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                reject(e);
            }
        }
    });
}

function jsonWithTimeout(res, timeoutMs) {
    return textWithTimeout(res, timeoutMs).then(function(txt) {
        if (!txt) return null;
        try {
            return JSON.parse(txt);
        } catch (eJson) {
            return null;
        }
    });
}

function toAbsolute(href, base) {
    if (!href) return "";
    var h = String(href).replace(/^\s+|\s+$/g, "");
    if (/^https?:\/\//i.test(h)) return h;
    if (h.indexOf("//") === 0) return "https:" + h;
    var baseNoSlash = String(base || BASE_URL).replace(/\/$/, "");
    if (h.charAt(0) === "/") return baseNoSlash + h;
    if (h.indexOf(":") === -1 && /^[a-z0-9\-_]+(\/|$)/i.test(h)) return baseNoSlash + "/" + h;
    return "";
}

function normalizeUrl(u, host) {
    var s = String(u || "");
    if (s.indexOf("//") === 0) return "https:" + s;
    if (s.charAt(0) === "/" && s.charAt(1) !== "/") return (host || "").replace(/\/$/, "") + s;
    return s;
}

function cleanTitle(str) {
    if (!str) return "";
    var norm = str;
    try {
        norm = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    } catch (e) {}
    return norm
        .toLowerCase()
        .replace(/[^a-z0-9\s]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function cleanSlug(urlOrSlug) {
    if (!urlOrSlug) return "";
    var path = String(urlOrSlug).replace(/^https?:\/\/[^/]+/i, "").replace(/\?.*$/, "").replace(/#.*$/, "");
    var parts = path.split("/").filter(function(s) { return !!s; });
    var last = parts.length > 0 ? parts[parts.length - 1] : "";
    return cleanTitle(last);
}

function scoreCandidate(url, titles, year) {
    var cleanS = cleanSlug(url);
    if (!cleanS) return 0;
    var slugWords = cleanS.split(/\s+/);
    var best = 0;

    for (var i = 0; i < titles.length; i++) {
        var t = cleanTitle(titles[i]);
        if (!t) continue;

        var sc = 0;

        if (cleanS === t || (year && cleanS === t + " " + String(year))) {
            sc = 100;
        } else if (cleanS.indexOf(t + " ") === 0) {
            var rest = cleanS.substring(t.length + 1).replace(/\s+/g, "");
            sc = /^\d+$/.test(rest) ? 65 : 85;
        } else {
            var words = t.split(/\s+/).filter(function(w) { return w.length > 2; });
            var targetWords = words.length > 0 ? words : t.split(/\s+/);
            var matches = 0;
            for (var j = 0; j < targetWords.length; j++) {
                if (slugWords.indexOf(targetWords[j]) !== -1) matches++;
            }
            if (matches > 0) {
                var ratio = matches / targetWords.length;
                if (ratio >= 0.65 || (year && slugWords.indexOf(String(year)) !== -1)) {
                    sc = Math.round(ratio * 80);
                }
            }
        }

        if (sc > 0 && year && slugWords.indexOf(String(year)) !== -1) sc += 20;
        if (sc > best) best = sc;
    }
    return best;
}

function unpackFromHtml(html) {
    if (!html) return "";
    var packRegex = /eval\(function\(p,a,c,k,e,[a-zA-Z0-9_]+\)\{[\s\S]*?\}\(\s*(['"])([\s\S]+?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]+?)\5\.split\(\s*(['"])\|\7\s*\)/g;
    var dict = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

    function decodeBase(val, radix) {
        var res = 0;
        for (var i = 0; i < val.length; i++) {
            var idx = dict.indexOf(val.charAt(i));
            if (idx === -1) return NaN;
            res = res * radix + idx;
        }
        return res;
    }

    var results = [];
    var packMatch;

    while ((packMatch = packRegex.exec(html)) !== null) {
        var p = packMatch[2];
        var a = parseInt(packMatch[3], 10);
        var k = packMatch[6].split("|");

        var unpacked = p.replace(/\b([0-9a-zA-Z]+)\b/g, function(token) {
            var index = decodeBase(token, a);
            if (isNaN(index) || index >= k.length) return token;
            return (k[index] && k[index] !== "") ? k[index] : token;
        });

        results.push(unpacked.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\//g, "/"));
    }

    return results.join("\n");
}

// ==========================================
// 2. DETECCIÓN DINÁMICA DE CALIDAD (v1.0 intacto)
// ==========================================

function detectQualityFromUrl(url) {
    if (!url) return null;
    var u = url.toLowerCase();

    if (u.indexOf(".urlset") !== -1) {
        var m = u.match(/[,_]([a-z,]+)[,_]\.urlset/);
        if (m) {
            var tags = m[1].split(",");
            if (tags.indexOf("x") !== -1 || tags.indexOf("o") !== -1 || tags.indexOf("h") !== -1) return "1080p";
            if (tags.indexOf("n") !== -1) return "720p";
            if (tags.indexOf("l") !== -1) return "480p";
        }
    }

    var pathOnly = u.split("?")[0].split("#")[0];
    if (/(?:^|[^a-z0-9])(4k|2160p?)(?:[^a-z0-9]|$)/i.test(pathOnly)) return "4K";
    if (/(?:^|[^a-z0-9])1080p?(?:[^a-z0-9]|$)/i.test(pathOnly)) return "1080p";
    if (/(?:^|[^a-z0-9])720p?(?:[^a-z0-9]|$)/i.test(pathOnly)) return "720p";
    if (/(?:^|[^a-z0-9])480p?(?:[^a-z0-9]|$)/i.test(pathOnly)) return "480p";
    return null;
}

function probeM3u8Quality(m3u8Url, headers) {
    var fastQ = detectQualityFromUrl(m3u8Url);
    if (fastQ) return Promise.resolve(fastQ);

    if (!m3u8Url || m3u8Url.indexOf(".m3u8") === -1) return Promise.resolve(null);

    if (REQUEST_T0 && Date.now() - REQUEST_T0 > GLOBAL_DEADLINE_MS) return Promise.resolve(null);

    return fetchWithTimeout(m3u8Url, {
        headers: headers || { "User-Agent": USER_AGENT },
        redirect: "follow"
    }, 2000)
    .then(function(res) {
        if (!isResOk(res)) return "";
        return textWithTimeout(res, 2000);
    })
    .then(function(text) {
        if (!text || text.indexOf("#EXT-X-STREAM-INF") === -1) {
            return detectQualityFromUrl(m3u8Url);
        }

        var maxW = 0, maxH = 0;
        var resRegex = /RESOLUTION=(\d+)x(\d+)/gi;
        var match;
        while ((match = resRegex.exec(text)) !== null) {
            var w = parseInt(match[1], 10);
            var h = parseInt(match[2], 10);
            if (w > maxW) maxW = w;
            if (h > maxH) maxH = h;
        }

        if (maxW >= 3840 || maxH >= 2160) return "4K";
        if (maxW >= 1920 || maxH >= 1080) return "1080p";
        if (maxW >= 1280 || maxH >= 720) return "720p";
        if (maxW >= 854 || maxH >= 480) return "480p";
        return null;
    })
    .catch(function() {
        return null;
    });
}

// ==========================================
// 3. RESOLVERS DE STREAMING (UNIFICADOS — v1.0 intacto)
// ==========================================

function matchesHost(lowerUrl, hosts) {
    for (var i = 0; i < hosts.length; i++) {
        if (lowerUrl.indexOf(hosts[i]) !== -1) return true;
    }
    return false;
}

function extractM3u8FromHtml(html) {
    if (!html) return null;
    var cleanHtml = html.replace(/\\\//g, "/");

    var m = cleanHtml.match(/(?:file|sources|src)\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i) ||
            cleanHtml.match(/["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);
    if (m && m[1]) return m[1];

    var unpacked = unpackFromHtml(html);
    if (unpacked) {
        var u = unpacked.match(/["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i) ||
                unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i);
        if (u) return u[1] || u[0];
    }
    return null;
}

function resolveEmbed(url, serverName, referer) {
    var hostMatch = String(url).match(/^(https?:\/\/[^/]+)/i);
    var host = hostMatch ? hostMatch[1] : "";

    return fetchWithTimeout(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": referer || host || BASE_URL },
        redirect: "follow"
    }, 2200)
    .then(function(res) {
        if (!isResOk(res)) return [];
        var finalUrl = res.url || url;
        return textWithTimeout(res, 2200).then(function(html) {
            var streamUrl = extractM3u8FromHtml(html);
            if (!streamUrl) return [];

            streamUrl = normalizeUrl(streamUrl, host);
            var headers = { "User-Agent": USER_AGENT, "Referer": finalUrl };

            return probeM3u8Quality(streamUrl, headers).then(function(q) {
                return [{
                    quality: q || "720p",
                    url: streamUrl,
                    server: serverName,
                    headers: headers
                }];
            });
        });
    })
    .catch(function() {
        return [];
    });
}

function resolveStreamWish(url) {
    var targetUrl = url;
    if (matchesHost(String(targetUrl).toLowerCase(), WISH_HOSTS)) {
        var idMatch = targetUrl.match(/\/(?:e|f|v)\/([a-zA-Z0-9_-]+)/);
        if (idMatch) targetUrl = "https://playerwish.com/e/" + idMatch[1];
    } else if (targetUrl.indexOf("/f/") !== -1 || targetUrl.indexOf("/v/") !== -1) {
        targetUrl = targetUrl.replace("/f/", "/e/").replace("/v/", "/e/");
    }
    return resolveEmbed(targetUrl, "StreamWish", targetUrl);
}

function resolveVidHide(url) {
    return resolveEmbed(url, "VidHide", BASE_URL + "/");
}

function resolveFilemoon(url) {
    return resolveEmbed(url, "Filemoon", url);
}

function resolveOkRu(htmlOrUrl) {
    var input = String(htmlOrUrl || "");
    var promise;

    if (input.indexOf("data-options=") !== -1) {
        promise = Promise.resolve(input);
    } else {
        promise = fetchWithTimeout(input.replace(/\/$/, ""), {
            headers: { "User-Agent": USER_AGENT },
            redirect: "follow"
        }, 2200)
        .then(function(res) {
            if (!isResOk(res)) return "";
            return textWithTimeout(res, 2200);
        })
        .catch(function() {
            return "";
        });
    }

    return promise.then(function(html) {
        if (!html) return [];
        var match = html.match(/data-options=["']([^"']+)["']/);
        if (!match) {
            logDiag("ok.ru sin data-options (player solo-JS desde 2026), opcion descartada");
            return [];
        }

        var decoded = match[1].replace(/&quot;/g, '"');
        var data;
        try {
            data = JSON.parse(decoded);
        } catch (e) {
            return [];
        }

        var rawMeta = data && data.flashvars && data.flashvars.metadata;
        var metadata = rawMeta;
        if (typeof rawMeta === "string") {
            try {
                metadata = JSON.parse(rawMeta);
            } catch (e2) {
                return [];
            }
        }
        if (!metadata || !metadata.videos || !Array.isArray(metadata.videos)) return [];

        var qualMap = {
            "full": "1080p",
            "hd": "720p",
            "sd": "480p",
            "low": "360p",
            "lowest": "240p",
            "mobile": "144p"
        };

        var streams = [];
        var preferred = ["full", "hd", "sd"];
        for (var p = 0; p < preferred.length; p++) {
            for (var v = 0; v < metadata.videos.length; v++) {
                var vid = metadata.videos[v];
                if (vid && vid.name === preferred[p] && vid.url) {
                    streams.push({
                        quality: qualMap[vid.name] || "720p",
                        url: vid.url,
                        server: "OK.ru",
                        headers: { "User-Agent": USER_AGENT, "Referer": "https://ok.ru/" }
                    });
                    break;
                }
            }
        }

        if (streams.length === 0 && metadata.videos.length > 0 && metadata.videos[0] && metadata.videos[0].url) {
            var first = metadata.videos[0];
            streams.push({
                quality: qualMap[first.name] || "720p",
                url: first.url,
                server: "OK.ru",
                headers: { "User-Agent": USER_AGENT, "Referer": "https://ok.ru/" }
            });
        }

        return streams;
    });
}

// ==========================================
// 4. BÚSQUEDA Y PARSEO DE PELISFORTE (v1.0 intacto)
// ==========================================

function searchPelisForte(query) {
    var searchUrl = BASE_URL + "/?s=" + encodeURIComponent(query);

    return fetchWithTimeout(searchUrl, { headers: DEFAULT_HEADERS }, 2400)
        .then(function(res) {
            if (!isResOk(res)) return "";
            return textWithTimeout(res, 2400);
        })
        .then(function(html) {
            if (!html) return [];

            var results = [];
            var seen = {};
            var linkRegex = /<a[^>]+href=["']([^"']+)["']/gi;
            var m;

            while ((m = linkRegex.exec(html)) !== null) {
                var abs = toAbsolute(m[1], BASE_URL);
                if (!abs) continue;
                var path = abs.replace(/^https?:\/\/[^/]+/i, "");
                if (!/\/(?:pelicula|serie)\/[^/]/i.test(path)) continue;
                if (!seen[abs]) {
                    seen[abs] = true;
                    results.push(abs);
                }
            }
            return results;
        })
        .catch(function() {
            return [];
        });
}

function findEpisodeLink(seriePageUrl, html, sNum, eNum) {
    if (!html) return null;
    var originMatch = String(seriePageUrl).match(/^(https?:\/\/[^/]+)/i);
    var base = originMatch ? originMatch[1] : BASE_URL;

    var nxn = new RegExp("(?:^|[^0-9])" + sNum + "x0?" + eNum + "(?:[^0-9]|$)", "i");
    var sxe = new RegExp("(?:^|[^0-9a-z])s0?" + sNum + "e0?" + eNum + "(?:[^0-9]|$)", "i");
    var tep = new RegExp("(?:^|[^0-9])temporada-0?" + sNum + "[^0-9]*episodio-0?" + eNum + "(?:[^0-9]|$)", "i");

    function matchesAny(u) {
        return nxn.test(u) || sxe.test(u) || tep.test(u);
    }

    var hrefRe = /<a[^>]+href=["']([^"']+)["']/gi;
    var episodioLinks = [];
    var otrosLinks = [];
    var seen = {};
    var m;

    while ((m = hrefRe.exec(html)) !== null) {
        var abs = toAbsolute(m[1], base);
        if (!abs || seen[abs]) continue;
        seen[abs] = true;
        if (abs.toLowerCase().indexOf("/episodio/") !== -1) episodioLinks.push(abs);
        else otrosLinks.push(abs);
    }

    for (var i = 0; i < episodioLinks.length; i++) {
        if (matchesAny(episodioLinks[i])) return episodioLinks[i];
    }
    for (var j = 0; j < otrosLinks.length; j++) {
        if (matchesAny(otrosLinks[j])) return otrosLinks[j];
    }
    return null;
}

function parseOptionsFromPage(html) {
    var options = [];
    if (!html) return options;

    var optPositions = [];
    var reOpt = /id=["']options-(\d+)["']/g;
    var om;
    while ((om = reOpt.exec(html)) !== null) {
        optPositions.push({ id: om[1], pos: om.index });
    }

    var tokensMap = {};
    for (var i = 0; i < optPositions.length; i++) {
        var start = optPositions[i].pos;
        var end = (i + 1 < optPositions.length) ? optPositions[i + 1].pos : start + 3000;
        var block = html.substring(start, end);
        var tokenMatch = block.match(/mp4\.nu\/\?h=([^"'\s&]+)/);
        if (tokenMatch) tokensMap[optPositions[i].id] = tokenMatch[1];
    }

    var LANG_ORDER = ["LAT", "CAST", "SUB"];
    var lnPositions = [];
    var reLn = /id=["']ln(\d+)["']/g;
    var lm;
    while ((lm = reLn.exec(html)) !== null) {
        lnPositions.push({ id: lm[1], pos: lm.index });
    }

    for (var l = 0; l < lnPositions.length; l++) {
        var lnStart = lnPositions[l].pos;
        var lnEnd = (l + 1 < lnPositions.length) ? lnPositions[l + 1].pos : lnStart + 6000;
        var blockHtml = html.substring(lnStart, lnEnd);
        var label = LANG_ORDER[parseInt(lnPositions[l].id, 10)] || ("LANG" + lnPositions[l].id);

        var optRegex = /<a[^>]+href=["']#options-(\d+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        var mOpt;

        while ((mOpt = optRegex.exec(blockHtml)) !== null) {
            var optId = mOpt[1];
            var inner = mOpt[2];
            var textOnly = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
            var lower = textOnly.toLowerCase();
            var server =
                lower.indexOf("ok") !== -1 ? "OK.ru" :
                lower.indexOf("wish") !== -1 ? "StreamWish" :
                lower.indexOf("hide") !== -1 ? "VidHide" :
                lower.indexOf("moon") !== -1 ? "Filemoon" :
                lower.indexOf("byse") !== -1 ? "Byse" : "Server";

            if (tokensMap[optId]) {
                options.push({
                    optId: optId,
                    token: tokensMap[optId],
                    lang: label,
                    server: server
                });
            }
        }
    }

    return options;
}

function resolveGatewayOption(item) {
    var rUrl = "https://mp4.nu/r.php?h=" + encodeURIComponent(item.token);

    return fetchWithTimeout(rUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": "https://mp4.nu/" },
        redirect: "follow"
    }, 2400)
    .then(function(res) {
        if (!res) return [];
        var finalUrl = res.url || rUrl;
        var finalLower = finalUrl.toLowerCase();

        // Byse (byseraguci.com y familia): player SPA con fingerprint attestation
        // antes del playback -> no extraible en ES5. Se salta sin mas peticiones.
        if (finalLower.indexOf("byse") !== -1 || finalLower.indexOf("bys-") !== -1) {
            logDiag("gateway -> Byse (host cerrado), opcion descartada [" + item.lang + "]");
            return [];
        }

        return textWithTimeout(res, 2400).then(function(html) {
            if (finalLower.indexOf("ok.ru") !== -1 || (html && html.indexOf("data-options=") !== -1)) {
                return resolveOkRu(html && html.indexOf("data-options=") !== -1 ? html : finalUrl);
            }
            if (matchesHost(finalLower, WISH_HOSTS)) {
                return resolveStreamWish(finalUrl);
            }
            if (matchesHost(finalLower, VIDHIDE_HOSTS)) {
                return resolveVidHide(finalUrl);
            }
            if (finalLower.indexOf("filemoon") !== -1) {
                return resolveFilemoon(finalUrl);
            }
            logDiag("gateway -> host no reconocido: " + finalUrl.slice(0, 90));
            return [];
        });
    })
    .then(function(streams) {
        return streams.map(function(s) {
            return {
                name: "PelisForte",
                title: s.quality + " · " + item.lang + " · " + s.server,
                quality: s.quality,
                url: s.url,
                headers: s.headers || {}
            };
        });
    })
    .catch(function() {
        return [];
    });
}

function trySearchAll(queries) {
    if (!queries || queries.length === 0) return Promise.resolve([]);

    var promises = queries.map(function(q) {
        return searchPelisForte(q);
    });

    return Promise.all(promises).then(function(arr) {
        for (var i = 0; i < arr.length; i++) {
            if (arr[i] && arr[i].length > 0) return arr[i];
        }
        return [];
    });
}

function dedupeStreams(streams) {
    var seen = {};
    var out = [];
    for (var i = 0; i < streams.length; i++) {
        var s = streams[i];
        if (!s || !s.url) continue;
        if (seen[s.url]) continue;
        seen[s.url] = true;
        out.push(s);
    }
    return out;
}

// ==========================================
// 5. CACHÉ EN MEMORIA (TTL 10 MIN — v1.0 intacto)
// ==========================================

function cacheGet(key) {
    var entry = CACHE[key];
    if (!entry) return null;
    if (Date.now() - entry.t > CACHE_TTL_MS) {
        delete CACHE[key];
        return null;
    }
    return entry.v;
}

function cacheSet(key, value) {
    CACHE[key] = { t: Date.now(), v: value };

    var keys = Object.keys(CACHE);
    if (keys.length <= 30) return;
    keys.sort(function(a, b) { return CACHE[a].t - CACHE[b].t; });
    while (keys.length > 20) {
        delete CACHE[keys.shift()];
    }
}

// ==========================================
// 6. FUNCIÓN PRINCIPAL EXPORTADA (getStreams)
// ==========================================

function getStreamsInner(idClean, mediaType, sNum, eNum, cacheKey) {
    var isMovie = mediaType === "movie";

    var tmdbUrl = "https://api.themoviedb.org/3/" + (isMovie ? "movie" : "tv") + "/" + idClean +
        "?api_key=" + TMDB_API_KEY + "&language=es-MX&append_to_response=alternative_titles";

    return fetchWithTimeout(tmdbUrl, {}, 2400)
        .then(function(res) {
            if (!isResOk(res)) throw new Error("TMDB HTTP Error");
            return jsonWithTimeout(res, 2400);
        })
        .then(function(meta) {
            if (!meta) throw new Error("TMDB JSON vacio");
            var title = isMovie ? (meta.title || meta.original_title) : (meta.name || meta.original_name);
            var origTitle = isMovie ? meta.original_title : meta.original_name;
            var year = ((isMovie ? meta.release_date : meta.first_air_date) || "").slice(0, 4);

            logDiag("TMDB ok: '" + (title || "?") + "' (" + year + ") " + (isMovie ? "movie" : "S" + sNum + "E" + eNum) + " timer=" + HAS_TIMER);

            var titles = [];
            if (title) titles.push(title);
            if (origTitle && titles.indexOf(origTitle) === -1) titles.push(origTitle);

            var altArr = (meta.alternative_titles && (meta.alternative_titles.results || meta.alternative_titles.titles)) || [];
            for (var i = 0; i < altArr.length; i++) {
                if (altArr[i].title && titles.indexOf(altArr[i].title) === -1) {
                    titles.push(altArr[i].title);
                }
            }

            var queries = [];
            for (var t = 0; t < titles.length; t++) {
                var c = cleanTitle(titles[t]);
                if (c && queries.indexOf(c) === -1) queries.push(c);
            }
            queries = queries.slice(0, 3);

            return trySearchAll(queries).then(function(candidates) {
                var bestUrl = null;
                var bestScore = 0;

                for (var j = 0; j < candidates.length; j++) {
                    var candUrl = candidates[j];
                    var isCandMovie = candUrl.indexOf("/pelicula/") !== -1;
                    if (isMovie !== isCandMovie) continue;

                    var sc = scoreCandidate(candUrl, titles, year);
                    if (sc >= SCORE_THRESHOLD && sc > bestScore) {
                        bestScore = sc;
                        bestUrl = candUrl;
                    }
                }

                if (!bestUrl) {
                    logDiag("sin candidato con score >= " + SCORE_THRESHOLD);
                    return null;
                }
                logDiag("candidato: " + bestUrl + " (score " + bestScore + ")");

                if (!isMovie) {
                    return fetchWithTimeout(bestUrl, { headers: DEFAULT_HEADERS }, 2400)
                        .then(function(sRes) {
                            if (!isResOk(sRes)) return "";
                            return textWithTimeout(sRes, 2400);
                        })
                        .then(function(sHtml) {
                            var epLink = findEpisodeLink(bestUrl, sHtml, sNum, eNum);
                            if (epLink) logDiag("episodio: " + epLink);
                            else logDiag("sin enlace de episodio en la pagina de serie");
                            return epLink;
                        });
                }

                return bestUrl;
            });
        })
        .then(function(pageUrl) {
            if (!pageUrl) return [];

            return fetchWithTimeout(pageUrl, { headers: DEFAULT_HEADERS }, 2400)
                .then(function(res) {
                    if (!isResOk(res)) return "";
                    return textWithTimeout(res, 2400);
                })
                .then(function(html) {
                    var options = parseOptionsFromPage(html);
                    if (options.length === 0) {
                        logDiag("pagina sin opciones de servidor");
                        return [];
                    }
                    logDiag("opciones: " + options.length);

                    options.sort(function(a, b) {
                        if (a.lang === "LAT" && b.lang !== "LAT") return -1;
                        if (b.lang === "LAT" && a.lang !== "LAT") return 1;
                        if (a.server !== "Byse" && b.server === "Byse") return -1;
                        if (b.server !== "Byse" && a.server === "Byse") return 1;
                        return 0;
                    });

                    // Filtrar Byse ANTES del top 4 para no gastar peticiones en hosts cerrados
                    var usable = options.filter(function(o) { return o.server !== "Byse"; });
                    var selected = (usable.length > 0 ? usable : options).slice(0, 4);

                    var promises = selected.map(function(item) {
                        return resolveGatewayOption(item);
                    });

                    return Promise.all(promises);
                })
                .then(function(results) {
                    var flat = [];
                    for (var r = 0; r < results.length; r++) {
                        if (Array.isArray(results[r])) {
                            flat = flat.concat(results[r]);
                        }
                    }
                    var streams = dedupeStreams(flat);
                    logDiag("total " + streams.length + " streams de " + flat.length + " resueltos (" + Math.round(tvElapsed()) + "ms)");
                    return streams;
                });
        })
        .then(function(streams) {
            if (streams && streams.length > 0) cacheSet(cacheKey, streams);
            return streams || [];
        })
        .catch(function(eStage) {
            logDiag("fallo de etapa: " + (eStage && eStage.message ? eStage.message : eStage));
            return [];
        });
}

// Contrato: getStreams SIEMPRE devuelve una Promesa que resuelve a un Array.
function getStreams(tmdbId, mediaType, season, episode) {
    try {
        START_TS = tvNow();
        REQUEST_T0 = START_TS;

        var idClean = String(tmdbId === null || tmdbId === undefined ? "" : tmdbId).replace(/[^0-9]/g, "");
        if (!idClean) return Promise.resolve([]);

        var isMovie = mediaType === "movie";
        var sParsed = parseInt(season, 10);
        var sNum = isNaN(sParsed) ? 1 : sParsed;
        var eParsed = parseInt(episode, 10);
        var eNum = isNaN(eParsed) ? 1 : eParsed;

        var cacheKey = idClean + ":" + (isMovie ? "m" : "t") + ":" + sNum + ":" + eNum;
        var cached = cacheGet(cacheKey);
        if (cached) return Promise.resolve(cached);

        logDiag("getStreams tmdbId=" + idClean + " type=" + mediaType + " s=" + season + " e=" + episode);

        return getStreamsInner(idClean, mediaType, sNum, eNum, cacheKey);
    } catch (eSync) {
        return Promise.resolve([]);
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { getStreams: getStreams };
} 
