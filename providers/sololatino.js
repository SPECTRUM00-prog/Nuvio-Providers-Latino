/**
 * Provider: SoloLatino (Películas y Series en Latino, Castellano y Sub)
 * Dominio: https://sololatino.net (Catálogo 100% Nativo de SoloLatino)
 * Motor: 100% Cadenas de Promesas (Hermes / QuickJS / NuvioTV Firestick Safe)
 * Reglas Hermes: Cero AbortController, Cero dependencias externas, resolución secuencial anti-WAF.
 *
 * v1.3 — BLUEPRINT NuvioTV: capa de red y helpers calcados de JKAnime, el provider
 *  que el usuario verificó funcionando 100% en NuvioTV Firestick 4K. Cambios:
 *  - fetchWithTimeout con Promise.race que NUNCA rechaza (timeout/error → null),
 *    igual que JKAnime; sin AbortController ni signal (Regla 4).
 *  - bodyWithTimeout nunca rechaza: timeout de lectura → null (Regla 4 conservada;
 *    JKAnime no la aplica y funciona, nosotros la mantenemos sin riesgo QuickJS).
 *  - NETWORK_TIMEOUT 2500→2800 ms y sonda HLS 1000→2500 ms (valores de JKAnime).
 *  - El deadline de 10000 ms (Regla 4) ya NO corta la cadena principal (TMDB,
 *    ficha, player-url, handshake s.php); solo acota la fase de profundización.
 *    En v1.2 una red lenta de TV agotaba el deadline antes del handshake y
 *    devolvía [] con el sitio respondiendo bien — causa probable del fallo en TV.
 *  - resolveEmbed prueba hasta 3 iframes (antes solo el primero) y normaliza
 *    espejos /f/ y /v/ → /e/ en la familia StreamWish (patrón JKAnime).
 *  - Familia deep-resolution ampliada (hglink, hgcloud, filemoon, marcas VidHide).
 *  - Umbral de calidad por RESOLUTION=WxH alineado a JKAnime (854/1280/1920/3840).
 *
 * v1.2 — EDICIÓN NuvioTV / Firestick: extracción PROFUNDA estilo providers originales.
 *  - DEEP RESOLUTION: los embeds de StreamWish (playerwish.com / vibuxer.com) y VidHide
 *    se resuelven hasta el m3u8/mp4 FINAL dentro del provider (unpacker Dean Edwards
 *    ES5 tolerante a bloques múltiples + regex file:/source:/URL desnuda + 1 salto de
 *    iframe). La TV ya no depende del locker /p.php?url=...&sig=...: el player de
 *    NuvioTV suele perder los headers al seguir redirects, y por eso el locker que
 *    funciona en móvil falla en el Firestick.
 *  - El locker /p.php del player también se resuelve: se sigue su redirect y se
 *    extrae el stream real (m3u8 directo o embed → archivo final).
 *  - Prioridad de servidores: StreamWish y VidHide se resuelven PRIMERO (igual que en
 *    el código original del usuario); el resto conserva el orden del sitio.
 *  - FALLBACK EXACTO v1.1: si la profundización falla (403, host nuevo, sin tiempo),
 *    se entrega la URL del locker/embed tal cual — el comportamiento que ya funciona
 *    en Nuvio móvil. Cero regresión por construcción.
 *  - Tope de lectura ~1 MB por respuesta (Regla 4) en textWithTimeout.
 *  - Deadline 10000 ms (Regla 4: 8000–10000) — en v1.3 solo acota la profundización.
 *
 * v1.1 — Auditoría (endpoints, handshake /s.php y firma FNV intactos):
 *  - textWithTimeout / jsonWithTimeout: timeout también sobre .text() y .json().
 *  - isResOk(): acepta res.ok o status 200-299 en TODAS las respuestas.
 *  - Temporada 0 (especiales) respetada: isNaN(sParsed) ? 1 : sParsed.
 *  - Año TMDB con paréntesis correctos: ((isMovie ? release_date : first_air_date) || "").slice(0, 4);
 *  - tmdbId sanitizado a solo dígitos.
 *  - toAbsolute(): búsqueda acepta links relativos y protocol-relative.
 *  - Deadline global revisado en cada bucle de reintento.
 *  - Scoring: penalización -25 si el slug trae un año distinto al objetivo.
 *  - Deduplicación final por url resultante además del rawU.
 *  - Series: episodio-N y episodio-0N, sin duplicar /temporada-.
 *  - Sonda HLS: lee RESOLUTION=WxH del manifiesto (máx 2 sondas, 1000 ms);
 *    panorámicas 1920x804 / 1920x1040 se clasifican 1080p.
 *  - rawU protocol-relative (//host/...) normalizado a https.
 *  - Export estricto: typeof module !== "undefined" (forma idéntica a JKAnime).
 *
 *  ⚠ NuvioTV: cada vez que cambie este archivo hay que SUBIR el campo "version"
 *    de manifest.json (ej. 1.0.2 -> 1.0.3). NuvioTV cachea el bytecode QuickJS
 *    por versión: sin bump sigue ejecutando el código viejo en la TV.
 */

var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var BASE_URL = "https://sololatino.net";
var PLAYER_HOST = "https://player.pelisserieshoy.com";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var NETWORK_TIMEOUT = 2800;      // v1.3: 2800 ms como JKAnime (Firestick OK)
var GLOBAL_DEADLINE_MS = 10000;  // Regla 4: presupuesto SOLO de la fase deep (v1.3)
var PROBE_HLS_QUALITY = true;
var HLS_PROBE_TIMEOUT = 2500;    // v1.3: 2500 ms como JKAnime (antes 1000, muy justo en TV)
var MAX_HLS_PROBES = 2;
var MAX_BODY_CHARS = 1000000;   // Regla 4: tope ~1 MB por respuesta
var MAX_SERVERS = 4;            // servidores a resolver por llamada (a=2 secuencial)
var MAX_DEEP_RESOLVES = 3;      // embeds/lockers que se profundizan por llamada

var DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-MX,es;q=0.9,en;q=0.8",
    "Referer": BASE_URL + "/"
};

// ==========================================
// 1. HELPERS DE RED & FORM (HERMES / TV SAFE)
// ==========================================

// Patrón de red JKAnime (verificado en Firestick 4K): Promise.race + timer.
// NUNCA rechaza: en timeout o error de red resuelve null. Sin AbortController
// ni signal (Regla 4). El try/catch cubre bridges que lanzan de forma síncrona.
function fetchWithTimeout(url, options, timeoutMs) {
    var limit = timeoutMs || NETWORK_TIMEOUT;
    var timer = null;

    var timeoutPromise = new Promise(function(_, reject) {
        timer = setTimeout(function() {
            reject(new Error("Timeout " + limit + "ms"));
        }, limit);
    });

    var fetchPromise;
    try {
        fetchPromise = fetch(url, options || {});
    } catch (eSync) {
        if (timer) clearTimeout(timer);
        return Promise.resolve(null);
    }

    return Promise.race([fetchPromise, timeoutPromise])
        .then(function(res) {
            if (timer) clearTimeout(timer);
            return res;
        })
        .catch(function() {
            if (timer) clearTimeout(timer);
            return null;
        });
}

// Regla 4: el body también puede colgarse tras recibir headers HTTP 200.
// Toda lectura de .text() o .json() pasa por aquí. Nunca rechaza: en timeout
// o error resuelve null (mismo contrato "siempre resuelve" que usa JKAnime).
function bodyWithTimeout(res, method, timeoutMs) {
    var limit = timeoutMs || NETWORK_TIMEOUT;
    return new Promise(function(resolve) {
        var settled = false;
        var timer = setTimeout(function() {
            if (!settled) { settled = true; resolve(null); }
        }, limit);
        try {
            res[method]().then(function(data) {
                if (!settled) { settled = true; clearTimeout(timer); resolve(data); }
            }).catch(function() {
                if (!settled) { settled = true; clearTimeout(timer); resolve(null); }
            });
        } catch (e) {
            if (!settled) { settled = true; clearTimeout(timer); resolve(null); }
        }
    });
}

function textWithTimeout(res, timeoutMs) {
    return bodyWithTimeout(res, "text", timeoutMs).then(function(txt) {
        if (typeof txt === "string" && txt.length > MAX_BODY_CHARS) {
            return txt.slice(0, MAX_BODY_CHARS);
        }
        return txt;
    });
}

function jsonWithTimeout(res, timeoutMs) {
    return bodyWithTimeout(res, "json", timeoutMs);
}

// Regla 4: algunos puentes nativos no rellenan res.ok; aceptar status 200-299.
function isResOk(res) {
    return !!res && (res.ok === true || (typeof res.status === "number" && res.status >= 200 && res.status < 300));
}

function ctxTimeLeft(ctx) {
    if (!ctx || !ctx.deadline) return 60000;
    return ctx.deadline - Date.now();
}

function padZero(num) {
    var n = parseInt(num, 10) || 0;
    return n < 10 ? "0" + n : String(n);
}

function buildFormBody(obj) {
    var parts = [];
    for (var k in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] !== undefined && obj[k] !== null) {
            parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(obj[k])));
        }
    }
    return parts.join("&");
}

function fnv1aHash(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        if (typeof Math.imul === "function") {
            h = Math.imul(h, 16777619) >>> 0;
        } else {
            h = (((h & 0xffff) * 16777619) + ((((h >>> 16) * 16777619) & 0xffff) << 16)) >>> 0;
        }
    }
    return (h >>> 0).toString(16);
}

// Regla 6: normaliza href relativo, protocol-relative o absoluto contra la base.
function toAbsolute(href, base) {
    if (!href) return "";
    var h = String(href).replace(/^\s+|\s+$/g, "");
    if (h.indexOf("https://") === 0 || h.indexOf("http://") === 0) return h;
    if (h.indexOf("//") === 0) return "https:" + h;
    if (h.indexOf("/") === 0) return base + h;
    return base + "/" + h;
}

function hostOf(url) {
    var m = String(url || "").match(/^https?:\/\/([^\/?#]+)/i);
    return m ? m[1].toLowerCase() : "";
}

// Familias cuyo embed sabemos profundizar. v1.3: misma lista que JKAnime
// dispatchea (StreamWish: wish/hglink/hgcloud/flaswish; VidHide: vidhide y sus
// marcas; Filemoon: filemoon/byse) + vibuxer/earnvids del código original.
function isEmbedHost(host) {
    if (!host) return false;
    return /(wish|vibuxer|vidhide|earnvids|hglink|hgcloud|morencius|minochinos|callistanise|filemoon|byse)/i.test(host);
}

function isDirectFileUrl(url) {
    var clean = String(url || "").split("?")[0].split("#")[0].toLowerCase();
    return /\.m3u8$/.test(clean) || /\.mp4$/.test(clean) || /(master|index|playlist)\.txt$/.test(clean);
}

function normalizeSlug(text) {
    if (!text) return "";
    var norm = text;
    try {
        norm = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    } catch (e) {}
    return norm
        .toLowerCase()
        .replace(/['’]/g, "")
        .replace(/[^a-z0-9\s-]/g, " ")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "")
        .trim();
}

function cleanText(str) {
    if (!str) return "";
    var norm = str;
    try {
        norm = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    } catch (e) {}
    return norm.toLowerCase().replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();
}

function cleanSlug(urlOrSlug) {
    if (!urlOrSlug) return "";
    var path = urlOrSlug.replace(/^https?:\/\/[^/]+/i, "");
    path = path.replace(/^\/(?:pelicula|serie|anime)\//i, "").replace(/\/.*$/, "");
    return cleanText(path);
}

function scoreCandidate(slugOrTitle, titles, year) {
    if (!slugOrTitle) return 0;
    var cleanS = cleanSlug(slugOrTitle);
    if (!cleanS) return 0;

    var slugWords = cleanS.split(/\s+/);
    var score = 0;

    for (var i = 0; i < titles.length; i++) {
        var t = cleanText(titles[i]);
        if (!t) continue;

        if (cleanS === t || (year && cleanS === t + " " + String(year))) {
            score = Math.max(score, 100);
            continue;
        }

        if (cleanS.indexOf(t + " ") === 0) {
            score = Math.max(score, 85);
            continue;
        }

        var words = t.split(/\s+/).filter(function(w) { return w.length > 2; });
        var targetWords = words.length > 0 ? words : t.split(/\s+/);
        var matches = 0;

        for (var j = 0; j < targetWords.length; j++) {
            if (slugWords.indexOf(targetWords[j]) !== -1) {
                matches++;
            }
        }

        if (targetWords.length > 0 && matches > 0) {
            var ratio = (matches / targetWords.length) * 80;
            score = Math.max(score, ratio);
        }
    }

    // Regla 6: bonificar el año correcto y penalizar años distintos en el slug
    // (protege secuelas). Si el título legítimo contiene ese año (ej. "2049"),
    // no se penaliza.
    if (score > 0 && year) {
        var targetYear = String(year);
        if (slugWords.indexOf(targetYear) !== -1) {
            score += 20;
        } else {
            for (var y = 0; y < slugWords.length; y++) {
                var wY = slugWords[y];
                if (/^(19|20)\d{2}$/.test(wY) && wY !== targetYear) {
                    var titleHasYear = false;
                    for (var ti = 0; ti < titles.length; ti++) {
                        var titleWords = cleanText(titles[ti]).split(/\s+/);
                        if (titleWords.indexOf(wY) !== -1) {
                            titleHasYear = true;
                            break;
                        }
                    }
                    if (!titleHasYear) {
                        score = Math.max(0, score - 25);
                    }
                    break;
                }
            }
        }
    }

    return score;
}

// Prioridad del usuario: StreamWish y VidHide primero (se extraen hasta el fondo).
function serverPriority(label) {
    var l = String(label || "").toLowerCase();
    if (l.indexOf("streamwish") !== -1 || l.indexOf("playerwish") !== -1 || l.indexOf("vibuxer") !== -1 || l.indexOf("wish") !== -1) return 0;
    if (l.indexOf("vidhide") !== -1 || l.indexOf("earnvids") !== -1) return 0;
    return 1;
}

function detectQuality(url, label) {
    // Regla 7: recorta ?query y #hash antes de aplicar regex de calidad.
    var cleanUrl = String(url || "").split("?")[0].split("#")[0].toLowerCase();
    var text = cleanUrl + " " + String(label || "").toLowerCase();
    if (text.indexOf(".urlset") !== -1) {
        var m = text.match(/[,_]([a-z,]+)[,_]\.urlset/);
        if (m) {
            var tags = m[1].split(",");
            if (tags.indexOf("x") !== -1 || tags.indexOf("o") !== -1 || tags.indexOf("h") !== -1) return "1080p";
            if (tags.indexOf("n") !== -1) return "720p";
            if (tags.indexOf("l") !== -1) return "480p";
        }
    }
    if (text.indexOf("master.m3u8") !== -1) return "1080p";
    if (/(?:^|[^a-z0-9])(?:4k|2160p?)(?:[^a-z0-9]|$)/i.test(text)) return "4K";
    if (/(?:^|[^a-z0-9])1080p?(?:[^a-z0-9]|$)/i.test(text)) return "1080p";
    if (/(?:^|[^a-z0-9])720p?(?:[^a-z0-9]|$)/i.test(text)) return "720p";
    if (/(?:^|[^a-z0-9])480p?(?:[^a-z0-9]|$)/i.test(text)) return "480p";
    return "720p";
}

// Regla 7: clasifica por ANCHO y ALTO; umbrales idénticos a JKAnime
// (una panorámica 1920x804 cae en 1080p por el ancho).
function classifyResolution(w, h) {
    if (w >= 3840 || h >= 2160) return "4K";
    if (w >= 1920 || h >= 1080) return "1080p";
    if (w >= 1280 || h >= 720) return "720p";
    if (w >= 854 || h >= 480) return "480p";
    return "Auto";
}

// Regla 7: en vez de asumir master.m3u8 = 1080p, lee el manifiesto y clasifica
// con RESOLUTION=WxH. Devuelve "" si no se pudo detectar (el llamante aplica
// el heurístico anterior).
function probeHlsQuality(url, referer) {
    return fetchWithTimeout(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": referer },
        redirect: "follow"
    }, HLS_PROBE_TIMEOUT)
        .then(function(res) {
            if (!isResOk(res)) return "";
            return textWithTimeout(res, HLS_PROBE_TIMEOUT);
        })
        .then(function(txt) {
            if (!txt) return "";
            var re = /RESOLUTION=(\d+)x(\d+)/gi;
            var bestW = 0;
            var bestH = 0;
            var m;
            while ((m = re.exec(txt)) !== null) {
                var w = parseInt(m[1], 10);
                var h = parseInt(m[2], 10);
                if (w * h > bestW * bestH) {
                    bestW = w;
                    bestH = h;
                }
            }
            if (bestH > 0) return classifyResolution(bestW, bestH);
            return "";
        })
        .catch(function() { return ""; });
}

// ==========================================
// 2. UNPACKER DEAN EDWARDS (ES5, bloques múltiples)
//    Los embeds de StreamWish/VidHide ofuscan el <script> con
//    eval(function(p,a,c,k,e,d){...})('payload',base,count,'k|k|k'.split('|'),0,{})
// ==========================================

// Aproxima el unescape del parser JS sin usar eval() ni new Function().
function unescapePayload(raw) {
    return String(raw || "").replace(/\\(.)/g, "$1");
}

// Token estilo Dean Edwards: índice c en base "a" (0-9a-z, luego A-Z vía +29).
function decToken(c, a) {
    var s = "";
    var n = c;
    while (n > 0) {
        var r = n % a;
        s = (r > 35 ? String.fromCharCode(r + 29) : r.toString(36)) + s;
        n = Math.floor(n / a);
    }
    return s === "" ? "0" : s;
}

// Desempaqueta UN bloque. Reemplazo con función (no string) para que claves
// con "$" no rompan String.replace. Tolerante: cualquier error devuelve "".
function unpackOne(payloadRaw, base, count, keysRaw) {
    try {
        var payload = unescapePayload(payloadRaw);
        var keys = unescapePayload(keysRaw).split("|");
        var out = payload;
        for (var i = count - 1; i >= 0; i--) {
            var tok = decToken(i, base);
            if (!tok) continue;
            var rep = (typeof keys[i] === "string" && keys[i] !== "") ? keys[i] : tok;
            if (rep === tok) continue;
            var re = new RegExp("\\b" + tok + "\\b", "g");
            out = out.replace(re, function() { return rep; });
        }
        return out;
    } catch (e) {
        return "";
    }
}

// Parsea 'payload',base,count,'keys' justo después de "}(" del packer.
// El payload puede contener comillas del tipo opuesto y escapes \x.
function extractPackedArgs(src, fromPos) {
    try {
        var seg = String(src).slice(fromPos, fromPos + 300000);
        var qi = -1;
        for (var i = 0; i < seg.length && i < 200; i++) {
            var ch = seg.charAt(i);
            if (ch === "'" || ch === '"') { qi = i; break; }
            if (ch === ")") return null;
        }
        if (qi < 0) return null;
        seg = seg.slice(qi);

        var q = seg.charAt(0);
        var cls = "[^\\\\" + q + "]";
        var reStr = "^" + q + "((?:\\\\.|" + cls + ")*)" + q +
                    "\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*" + q +
                    "((?:\\\\.|" + cls + ")*)" + q;
        var m = seg.match(new RegExp(reStr));
        if (!m) return null;
        var base = parseInt(m[2], 10);
        var count = parseInt(m[3], 10);
        if (!isFinite(base) || !isFinite(count) || base < 2 || base > 64 || count < 1 || count > 5000) return null;
        return { payload: m[1], base: base, count: count, keys: m[4] };
    } catch (e) {
        return null;
    }
}

// Desempaqueta TODOS los bloques eval() del HTML; un bloque corrupto no
// afecta a los demás (tolerancia multi-bloque, Regla 8).
function unpackAll(html) {
    var out = [];
    var marker = "eval(function(p,a,c,k,e,";
    var pos = 0;
    var guard = 0;
    try {
        while (guard < 6) {
            guard++;
            var s = html.indexOf(marker, pos);
            if (s === -1) break;
            var open = html.indexOf("}(", s);
            if (open === -1) break;
            var argsStart = open + 2;
            pos = argsStart;
            var args = extractPackedArgs(html, argsStart);
            if (args) {
                var un = unpackOne(args.payload, args.base, args.count, args.keys);
                if (un) out.push(un);
            }
        }
    } catch (e) {}
    return out.join("\n");
}

// ==========================================
// 3. EXTRACCIÓN DEL STREAM FINAL (StreamWish / VidHide / locker)
// ==========================================

// Reúne URLs de archivo dentro del HTML (empaquetado o no).
function collectFileUrls(hay) {
    var urls = [];
    var m;
    try {
        var re = /(?:file|source)\s*[:=]\s*["']([^"'\s]{12,500})["']/gi;
        while ((m = re.exec(hay)) !== null && urls.length < 24) {
            var u = m[1];
            if (u.charAt(0) === "#" || u.indexOf("data:") === 0) continue;
            if (/\.(m3u8|mp4|(?:master|index|playlist)\.txt)(\?|#|$)/i.test(u) || u.indexOf(".m3u8") !== -1) {
                urls.push(u);
            }
        }
        if (urls.length === 0) {
            var re2 = /["']((?:https?:)?\/\/[^"'\s]{12,500})["']/gi;
            while ((m = re2.exec(hay)) !== null && urls.length < 24) {
                var u2 = m[1];
                if (/\.(m3u8|mp4|(?:master|index|playlist)\.txt)(\?|#|$)/i.test(u2)) {
                    urls.push(u2);
                }
            }
        }
    } catch (e) {}
    return urls;
}

function pickStreamUrl(urls) {
    for (var i = 0; i < urls.length; i++) {
        if (/\.(m3u8|(?:master|index|playlist)\.txt)(\?|#|$)/i.test(urls[i]) || urls[i].indexOf(".m3u8") !== -1) {
            return { url: urls[i], kind: "hls" };
        }
    }
    for (var j = 0; j < urls.length; j++) {
        if (/\.mp4(\?|#|$)/i.test(urls[j])) return { url: urls[j], kind: "mp4" };
    }
    return null;
}

// Normaliza y valida la URL final; headers listos para el player de la TV.
function extractStreamFromHtml(html, pageUrl) {
    if (!html || !pageUrl) return null;
    var hay = html + "\n" + unpackAll(html);
    var urls = collectFileUrls(hay);
    var picked = pickStreamUrl(urls);
    if (!picked) return null;
    var u = picked.url;
    if (u.indexOf("//") === 0) u = "https:" + u;
    else if (u.indexOf("/") === 0) u = toAbsolute(u, pageUrl);
    if (u.indexOf("http") !== 0) return null;
    return {
        url: u,
        kind: picked.kind,
        headers: { "User-Agent": USER_AGENT, "Referer": pageUrl }
    };
}

// Resuelve un embed de StreamWish/VidHide al archivo final.
// Estrategia: 1) unpacker + regex, 2) hasta 3 saltos de iframe (secuenciales,
// con presupuesto de tiempo). Espejos /f/ y /v/ → /e/ en familia StreamWish.
function resolveEmbed(embedUrl, referer, ctx) {
    if (ctxTimeLeft(ctx) < 3000) return Promise.resolve(null);

    // v1.3 (patrón JKAnime): en la familia StreamWish, /f/ y /v/ son archivos;
    // el embed reproducible vive en /e/.
    var target = embedUrl;
    var tHost = hostOf(target);
    if (/(wish|vibuxer|hglink|hgcloud|flaswish|hlswish)/i.test(tHost) &&
        (target.indexOf("/f/") !== -1 || target.indexOf("/v/") !== -1)) {
        target = target.replace("/f/", "/e/").replace("/v/", "/e/");
    }

    var opts = {
        headers: {
            "User-Agent": USER_AGENT,
            "Referer": referer || BASE_URL + "/",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "es-MX,es;q=0.9,en;q=0.8"
        },
        redirect: "follow"
    };
    return fetchWithTimeout(target, opts, NETWORK_TIMEOUT)
        .then(function(res) {
            if (!isResOk(res)) return null;
            var embedPageUrl = res.url || target;
            return textWithTimeout(res).then(function(html) {
                var hit = extractStreamFromHtml(html, embedPageUrl);
                if (hit) return hit;

                // Saltos de iframe (hasta 3, con presupuesto de tiempo)
                var iframeUrls = [];
                var reIframe = /<iframe[^>]+src=["']([^"']+)["']/gi;
                var im;
                while ((im = reIframe.exec(html)) !== null && iframeUrls.length < 3) {
                    var abs = toAbsolute(im[1], embedPageUrl);
                    if (abs && abs.indexOf("http") === 0 && abs !== target && abs !== embedUrl && iframeUrls.indexOf(abs) === -1) {
                        iframeUrls.push(abs);
                    }
                }

                function tryIframe(idx) {
                    if (idx >= iframeUrls.length) return null;
                    if (ctxTimeLeft(ctx) < 3000) return null;
                    var iframeUrl = iframeUrls[idx];
                    var iframeOpts = {
                        headers: {
                            "User-Agent": USER_AGENT,
                            "Referer": embedPageUrl,
                            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                            "Accept-Language": "es-MX,es;q=0.9,en;q=0.8"
                        },
                        redirect: "follow"
                    };
                    return fetchWithTimeout(iframeUrl, iframeOpts, NETWORK_TIMEOUT)
                        .then(function(res2) {
                            if (!isResOk(res2)) return tryIframe(idx + 1);
                            return textWithTimeout(res2).then(function(html2) {
                                var hit2 = extractStreamFromHtml(html2, res2.url || iframeUrl);
                                if (hit2) return hit2;
                                return tryIframe(idx + 1);
                            });
                        })
                        .catch(function() { return tryIframe(idx + 1); });
                }

                return tryIframe(0);
            });
        })
        .catch(function() { return null; });
}

// Resuelve el locker /p.php?url=...&sig=... del player: sigue el redirect y
// extrae lo que entrega (m3u8 directo, o HTML de embed → archivo final).
function resolveLocker(lockerUrl, referer, ctx) {
    if (ctxTimeLeft(ctx) < 3000) return Promise.resolve(null);
    return fetchWithTimeout(lockerUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": referer },
        redirect: "follow"
    }, NETWORK_TIMEOUT)
        .then(function(res) {
            if (!isResOk(res)) return null;
            var finalUrl = res.url || lockerUrl;
            return textWithTimeout(res).then(function(txt) {
                if (txt && txt.indexOf("#EXTM3U") !== -1) {
                    return {
                        url: finalUrl,
                        kind: "hls",
                        headers: { "User-Agent": USER_AGENT, "Referer": referer || finalUrl }
                    };
                }
                return extractStreamFromHtml(txt, finalUrl);
            });
        })
        .catch(function() { return null; });
}

// Decide si a este resultado del a=2 le corresponde profundización y la ejecuta.
// Devuelve { url, kind, headers } o null (el llamante usa el fallback v1.1).
function resolveDeep(finalUrl, rawU, d, playerUrl, ctx) {
    if (!ctx) return Promise.resolve(null);
    if (ctx.deepTries >= MAX_DEEP_RESOLVES) return Promise.resolve(null);
    if (ctxTimeLeft(ctx) < 3200) return Promise.resolve(null);
    // El proxy MP4 /p.php?v= ya es reproductible tal cual (funciona en móvil).
    if (finalUrl.indexOf("/p.php?v=") !== -1) return Promise.resolve(null);

    var rawHost = hostOf(rawU);
    var finalHost = hostOf(finalUrl);

    // Caso 1: el a=2 entregó directamente el embed de StreamWish/VidHide.
    if (isEmbedHost(rawHost)) {
        ctx.deepTries++;
        return resolveEmbed(rawU, playerUrl, ctx);
    }
    // Caso 2: la URL final es un embed (con o sin /embed- en el path).
    if (isEmbedHost(finalHost) || finalUrl.indexOf("/embed-") !== -1) {
        ctx.deepTries++;
        return resolveEmbed(finalUrl, playerUrl, ctx);
    }
    // Caso 3: locker firmado del player → seguirlo y extraer el stream real.
    if (d && (d.sig || finalUrl.indexOf("/p.php?url=") !== -1)) {
        ctx.deepTries++;
        return resolveLocker(finalUrl, playerUrl, ctx);
    }
    return Promise.resolve(null);
}

// ==========================================
// 4. EXTRACCIÓN DE FICHA Y PLAYER LARAVEL
// ==========================================

function fetchDirectPage(urls, ctx) {
    if (!urls || urls.length === 0) return Promise.resolve(null);

    function tryNext(idx) {
        if (idx >= urls.length) return Promise.resolve(null);
        var u = urls[idx];
        return fetchWithTimeout(u, { headers: DEFAULT_HEADERS, redirect: "follow" }, NETWORK_TIMEOUT)
            .then(function(res) {
                if (!isResOk(res)) return tryNext(idx + 1);
                return textWithTimeout(res).then(function(html) {
                    if (html && html.indexOf("data-player-token") !== -1) {
                        return { url: res.url || u, html: html };
                    }
                    return tryNext(idx + 1);
                });
            })
            .catch(function() { return tryNext(idx + 1); });
    }

    return tryNext(0);
}

function searchSoloLatino(queries, isMovie, titles, year, ctx) {
    function tryQuery(idx) {
        if (idx >= queries.length) return Promise.resolve(null);
        var searchUrl = BASE_URL + "/buscar?q=" + encodeURIComponent(queries[idx]);

        return fetchWithTimeout(searchUrl, { headers: DEFAULT_HEADERS }, NETWORK_TIMEOUT)
            .then(function(res) { return isResOk(res) ? textWithTimeout(res) : ""; })
            .then(function(html) {
                if (!html) return tryQuery(idx + 1);

                var prefix = isMovie ? "/pelicula/" : "/serie/";
                // Regla 6: acepta absoluto, protocol-relative y relativo, y pasa por toAbsolute.
                var regex = /href=["']((?:(?:https?:)?\/\/sololatino\.net)?\/(?:pelicula|serie)\/[^"'\s<>]+)["']/gi;
                var candidates = [];
                var seen = [];
                var m;

                while ((m = regex.exec(html)) !== null) {
                    var link = toAbsolute(m[1], BASE_URL);
                    if (link.indexOf(prefix) === -1 || seen.indexOf(link) !== -1) continue;
                    seen.push(link);

                    var sc = scoreCandidate(link, titles, year);
                    if (sc >= 35) {
                        candidates.push({ url: link, score: sc });
                    }
                }

                if (candidates.length > 0) {
                    candidates.sort(function(a, b) { return b.score - a.score; });
                    return candidates[0].url;
                }
                return tryQuery(idx + 1);
            })
            .catch(function() { return tryQuery(idx + 1); });
    }

    return tryQuery(0);
}

function extractPlayerTokens(html) {
    var csrfMatch = html.match(/name=["']csrf-token["']\s+content=["']([^"']+)["']/i);
    var csrf = csrfMatch ? csrfMatch[1] : "";

    var btnRegex = /data-player-token=["']([^"']+)["'][^>]*>([\s\S]*?)<\/button>/gi;
    var tokens = [];
    var m;

    while ((m = btnRegex.exec(html)) !== null) {
        var label = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().toLowerCase();
        tokens.push({ token: m[1], isPrincipal: label.indexOf("principal") !== -1 });
    }

    if (tokens.length === 0 || !csrf) return null;

    tokens.sort(function(a, b) {
        if (a.isPrincipal && !b.isPrincipal) return -1;
        if (!a.isPrincipal && b.isPrincipal) return 1;
        return 0;
    });

    return { csrf: csrf, tokens: tokens };
}

function resolvePelisSeriesHoy(playerUrl, pageUrl, ctx) {
    // v1.3: el presupuesto de 10000 ms (Regla 4) arranca AQUÍ y acota SOLO la
    // fase de profundización/sondas; la cadena principal (handshake s.php)
    // nunca se corta por deadline — mismo comportamiento que JKAnime en TV.
    if (ctx) ctx.deadline = Date.now() + GLOBAL_DEADLINE_MS;

    return fetchWithTimeout(playerUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": pageUrl },
        redirect: "follow"
    }, NETWORK_TIMEOUT)
    .then(function(res) {
        if (!isResOk(res)) return [];
        return textWithTimeout(res);
    })
    .then(function(html) {
        if (!html) return [];

        var tMatch = html.match(/const\s+_t\s*=\s*['"]([^'"]+)['"]/);
        var qcMatch = html.match(/var\s+_qc\s*=\s*['"]([^'"]+)['"]/);
        var qkMatch = html.match(/(?:var|let|const)\s+_qk\s*=\s*(\[[^\]]+\])/);
        var q9Match = html.match(/function\s+_q9\s*\(\)\s*\{\s*return\s+([^;]+);/);

        if (!tMatch || !qkMatch || !q9Match) return [];

        var tok = tMatch[1];
        var idUrlMatch = playerUrl.match(/\/f\/([^?&/]+)/);
        var qc = qcMatch ? qcMatch[1] : (idUrlMatch ? idUrlMatch[1] : "");

        var qkArr = null;
        try {
            qkArr = JSON.parse(qkMatch[1]);
        } catch (e) {
            return [];
        }

        var qv = q9Match[1].replace(/_qk\[(\d+)\]/g, function(_, idx) {
            return qkArr[parseInt(idx, 10)] || "";
        }).replace(/\s*\+\s*/g, "");

        var qt = fnv1aHash(qv + "|clk|" + qc);

        function postS(params) {
            params.tok = tok;
            params.rt = qv;
            params.tk = qt;
            params.ao = BASE_URL;

            return fetchWithTimeout(PLAYER_HOST + "/s.php", {
                method: "POST",
                headers: {
                    "User-Agent": USER_AGENT,
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Origin": PLAYER_HOST,
                    "Referer": playerUrl
                },
                body: buildFormBody(params)
            }, NETWORK_TIMEOUT)
            .then(function(r) { return isResOk(r) ? jsonWithTimeout(r) : null; })
            .catch(function() { return null; });
        }

        function fallbackQuality(isMp4, targetUrl, cleanLabel) {
            if (isMp4) return "720p";
            if (targetUrl.indexOf("master.m3u8") !== -1) return "1080p";
            return detectQuality(targetUrl, cleanLabel);
        }

        // PASO 1: Listar opciones disponibles
        return postS({ a: "1" }).then(function(scan) {
            if (!scan) return [];

            var candidates = [];
            var langsMap = scan.langs_s || {};
            var langOrder = ["LAT", "SUB", "ESP"];
            var candIdx = 0;

            for (var l = 0; l < langOrder.length; l++) {
                var langCode = langOrder[l];
                var arr = langsMap[langCode];
                if (Array.isArray(arr)) {
                    for (var i = 0; i < arr.length && i < 4; i++) {
                        if (arr[i] && arr[i][1]) {
                            candidates.push({ lang: langCode, label: arr[i][0] || "Stream", id: arr[i][1], _i: candIdx++ });
                        }
                    }
                }
            }

            if (candidates.length === 0 && Array.isArray(scan.s)) {
                for (var s = 0; s < Math.min(4, scan.s.length); s++) {
                    if (scan.s[s] && scan.s[s][1]) {
                        candidates.push({ lang: "LAT", label: scan.s[s][0] || "Stream", id: scan.s[s][1], _i: candIdx++ });
                    }
                }
            }

            // v1.2: StreamWish/VidHide primero, orden del sitio dentro de cada grupo
            // (sort estable por índice original; el WAF solo exige SECUENCIALIDAD).
            candidates.sort(function(a, b) {
                var pa = serverPriority(a.label);
                var pb = serverPriority(b.label);
                if (pa !== pb) return pa - pb;
                return a._i - b._i;
            });
            var items = candidates.slice(0, MAX_SERVERS);

            if (items.length === 0) return [];

            // PASO 2: Autorizar sesión con a=click
            return postS({ a: "click", ts: "1" }).then(function() {
                // PASO 3: Resolver SECUENCIALMENTE para que el WAF no devuelva 403
                var results = [];
                var seenKeys = [];
                var seenUrls = [];

                function resolveNext(idx) {
                    if (idx >= items.length) return Promise.resolve(results);
                    var item = items[idx];

                    return postS({ a: "2", v: item.id, src: scan.src || "" })
                        .then(function(d) {
                            if (!d || !d.u) return resolveNext(idx + 1);

                            var rawU = String(d.u);
                            var finalUrl = null;

                            if (rawU.indexOf("/p.php") === 0) {
                                finalUrl = PLAYER_HOST + rawU;
                            } else if (rawU.indexOf("//") === 0) {
                                finalUrl = "https:" + rawU;
                            } else if (rawU.indexOf("http") === 0 && d.sig) {
                                finalUrl = PLAYER_HOST + "/p.php?url=" + encodeURIComponent(rawU) +
                                           "&sig=" + encodeURIComponent(String(d.sig)) +
                                           (d.ctx ? "&ctx=" + encodeURIComponent(String(d.ctx)) : "");
                            } else if (rawU.indexOf("http") === 0) {
                                finalUrl = rawU;
                            }

                            if (!finalUrl || seenKeys.indexOf(rawU) !== -1) return resolveNext(idx + 1);

                            var cleanLabel = item.label.replace(/[^\w\s+áéíóúñÁÉÍÓÚÑ.-]/g, "").trim() || "Servidor";

                            // v1.2 NuvioTV: profundizar embed/locker hasta el archivo final.
                            // Si falla, deep = null y se conserva EXACTO el flujo v1.1.
                            return resolveDeep(finalUrl, rawU, d, playerUrl, ctx)
                                .then(function(deep) {
                                    var targetUrl = finalUrl;
                                    var targetHeaders = { "User-Agent": USER_AGENT, "Referer": playerUrl };

                                    if (deep && deep.url) {
                                        if (seenUrls.indexOf(deep.url) !== -1) return resolveNext(idx + 1);
                                        targetUrl = deep.url;
                                        targetHeaders = deep.headers;
                                    } else if (seenUrls.indexOf(finalUrl) !== -1) {
                                        return resolveNext(idx + 1);
                                    }

                                    seenKeys.push(rawU);
                                    seenUrls.push(targetUrl);

                                    var isMp4 = (d.type === "mp4" ||
                                                 rawU.indexOf("/p.php?v=") !== -1 ||
                                                 (deep && deep.kind === "mp4"));

                                    var qualityFallback = fallbackQuality(isMp4, targetUrl, cleanLabel);
                                    var canProbe = PROBE_HLS_QUALITY && !isMp4 &&
                                        targetUrl.indexOf(".m3u8") !== -1 &&
                                        ctx && typeof ctx.probes === "number" &&
                                        ctx.probes < MAX_HLS_PROBES &&
                                        ctxTimeLeft(ctx) > 3000;

                                    function pushWith(qual) {
                                        results.push({
                                            name: "SoloLatino",
                                            title: qual + " · " + item.lang + " · " + cleanLabel + (isMp4 ? " (MP4)" : ""),
                                            quality: qual,
                                            url: targetUrl,
                                            headers: targetHeaders
                                        });
                                        return resolveNext(idx + 1);
                                    }

                                    if (canProbe) {
                                        ctx.probes++;
                                        return probeHlsQuality(targetUrl, targetHeaders.Referer)
                                            .then(function(detected) {
                                                return pushWith(detected || qualityFallback);
                                            });
                                    }

                                    return pushWith(qualityFallback);
                                });
                        })
                        .catch(function() {
                            return resolveNext(idx + 1);
                        });
                }

                return resolveNext(0);
            });
        });
    })
    .catch(function() { return []; });
}

// ==========================================
// 5. FUNCIÓN PRINCIPAL EXPORTADA (getStreams)
// ==========================================

function getStreams(tmdbId, mediaType, season, episode) {
    var isMovie = mediaType === "movie";

    // Regla 6: sanitizar tmdbId a solo dígitos.
    var tmdbIdStr = String(tmdbId === undefined || tmdbId === null ? "" : tmdbId).replace(/[^0-9]/g, "");
    if (!tmdbIdStr) return Promise.resolve([]);

    // Regla 6: la temporada 0 (especiales) NO se convierte en 1.
    var sParsed = parseInt(season, 10);
    var sNum = isNaN(sParsed) ? 1 : sParsed;
    var eParsed = parseInt(episode, 10);
    var eNum = isNaN(eParsed) ? 1 : eParsed;
    var epPadded = padZero(eNum);

    // v1.3: sin deadline en la cadena principal (patrón JKAnime probado en
    // Firestick); el deadline se fija al entrar a la fase del player y acota
    // SOLO la profundización (embeds/lockers/sondas HLS).
    var ctx = { deadline: 0, probes: 0, deepTries: 0 };

    var tmdbUrl = "https://api.themoviedb.org/3/" + (isMovie ? "movie" : "tv") + "/" + tmdbIdStr + "?api_key=" + TMDB_API_KEY + "&language=es-MX&append_to_response=alternative_titles";

    return fetchWithTimeout(tmdbUrl, null, 2500)
        .then(function(res) {
            if (!isResOk(res)) throw new Error("TMDB HTTP Error");
            return jsonWithTimeout(res);
        })
        .then(function(meta) {
            if (!meta) throw new Error("TMDB vacio");

            var title = isMovie ? (meta.title || meta.original_title) : (meta.name || meta.original_name);
            var origTitle = isMovie ? meta.original_title : meta.original_name;
            // Regla 6: paréntesis correctos; el || "" protege AMBAS ramas.
            var year = ((isMovie ? meta.release_date : meta.first_air_date) || "").slice(0, 4);

            var titles = [];
            if (title) titles.push(title);
            if (origTitle && origTitle !== title) titles.push(origTitle);

            var altArr = (meta.alternative_titles && (meta.alternative_titles.results || meta.alternative_titles.titles)) || [];
            for (var i = 0; i < altArr.length; i++) {
                if (altArr[i].title && titles.indexOf(altArr[i].title) === -1) {
                    titles.push(altArr[i].title);
                }
            }

            var directUrls = [];
            var searchQueries = [];

            for (var j = 0; j < titles.length; j++) {
                var cleanQ = cleanText(titles[j]);
                if (cleanQ && searchQueries.indexOf(cleanQ) === -1) searchQueries.push(cleanQ);

                var slug = normalizeSlug(titles[j]);
                if (!slug) continue;

                if (isMovie) {
                    var u1 = BASE_URL + "/pelicula/" + slug;
                    if (directUrls.indexOf(u1) === -1) directUrls.push(u1);
                    if (year) {
                        var u2 = BASE_URL + "/pelicula/" + slug + "-" + year;
                        if (directUrls.indexOf(u2) === -1) directUrls.push(u2);
                    }
                } else {
                    var epUrl1 = BASE_URL + "/serie/" + slug + "/temporada-" + sNum + "/episodio-" + eNum;
                    var epUrl2 = BASE_URL + "/serie/" + slug + "/temporada-" + sNum + "/episodio-" + epPadded;
                    if (directUrls.indexOf(epUrl1) === -1) directUrls.push(epUrl1);
                    if (directUrls.indexOf(epUrl2) === -1) directUrls.push(epUrl2);
                }
            }

            return fetchDirectPage(directUrls.slice(0, 4), ctx).then(function(pageObj) {
                if (pageObj) return pageObj;

                return searchSoloLatino(searchQueries.slice(0, 3), isMovie, titles, year, ctx).then(function(foundBaseUrl) {
                    if (!foundBaseUrl) return null;

                    var cleanBase = foundBaseUrl.replace(/\/$/, "");
                    if (isMovie) return fetchDirectPage([cleanBase], ctx);

                    // Si el buscador ya devolvió un link de episodio, no duplicar /temporada-.
                    if (cleanBase.indexOf("/temporada-") !== -1 && cleanBase.indexOf("/episodio-") !== -1) {
                        return fetchDirectPage([cleanBase], ctx);
                    }

                    // Probar episodio sin y con padding (episodio-3 y episodio-03).
                    return fetchDirectPage([
                        cleanBase + "/temporada-" + sNum + "/episodio-" + eNum,
                        cleanBase + "/temporada-" + sNum + "/episodio-" + epPadded
                    ], ctx);
                });
            });
        })
        .then(function(pageObj) {
            if (!pageObj) return [];

            var tokenInfo = extractPlayerTokens(pageObj.html);
            if (!tokenInfo) return [];

            function tryToken(tIdx) {
                if (tIdx >= Math.min(2, tokenInfo.tokens.length)) return Promise.resolve(null);
                var tok = tokenInfo.tokens[tIdx].token;

                return fetchWithTimeout(BASE_URL + "/api/player-url", {
                    method: "POST",
                    headers: {
                        "User-Agent": USER_AGENT,
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                        "Origin": BASE_URL,
                        "Referer": pageObj.url,
                        "X-CSRF-TOKEN": tokenInfo.csrf,
                        "X-Requested-With": "XMLHttpRequest"
                    },
                    body: JSON.stringify({ t: tok })
                }, NETWORK_TIMEOUT)
                .then(function(res) { return isResOk(res) ? jsonWithTimeout(res) : null; })
                .then(function(json) {
                    if (json && json.url && json.url.indexOf("pelisserieshoy.com") !== -1) {
                        return json.url;
                    }
                    return tryToken(tIdx + 1);
                })
                .catch(function() { return tryToken(tIdx + 1); });
            }

            return tryToken(0).then(function(playerUrl) {
                if (!playerUrl) return [];
                return resolvePelisSeriesHoy(playerUrl, pageObj.url, ctx);
            });
        })
        .catch(function() {
            return [];
        });
}

// Forma de export idéntica a JKAnime (verificada en NuvioTV).
if (typeof module !== "undefined") {
    module.exports = { getStreams: getStreams };
} 
