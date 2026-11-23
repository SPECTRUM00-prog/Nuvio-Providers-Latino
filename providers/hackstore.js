/**
 * Provider: Hackstore2 (Películas y Series)
 * Motor: 100% Cadenas de Promesas (Hermes / QuickJS / Android TV / FireTV Safe)
 * Reglas Hermes: ES5 estricto, timeouts en headers Y body, cero dependencias.
 *
 * Cambios v2.3-NUVIOTV (2026-11) - capa runtime portada de jkanime v2.9 / sololatino v2.0 /
 * cinecalidad v2.4-NUVIOTV:
 *  1) FIX CRITICO DE TV: el QuickJS de NuvioTV (dokar quickjs-kt + polyfill de
 *     PluginRuntime.kt) NO define setTimeout/clearTimeout. La v2.2 los usaba sin
 *     condition dentro de fetchWithTimeout (y montaba un AbortController solo
 *     disponible en Hermes) -> el executor de la promesa lanzaba TypeError al
 *     instante, TODA la cadena rechazaba y getStreams devolvia [] SOLO en TV
 *     (en PC/Hermes funcionaba). Ahora HAS_TIMER detecta el runtime: con timer
 *     (Hermes movil / PC / Node) se conserva el timeout por llamada con abort;
 *     sin timer (TV) fetch directo apoyado en el corte real de OkHttp (30s
 *     connect / 30s read).
 *  2) PRESUPUESTO GLOBAL Date.now() de 45s (el runtime mata el plugin a los 60s):
 *     cada fetch verifica tvRemaining() y se cancela con null si queda < 400ms,
 *     para que el provider devuelva lo que tenga en vez de morir con error.
 *  3) PUENTE __native_fetch (NuvioTV 1.1.1): fetch(url, options || {}) y
 *     try/catch sincrono: el puente puede rechazar opciones nulas o lanzar de
 *     forma sincrona, lo que cortaba la cadena completa en silencio.
 *  4) TIMEOUT TAMBIEN SOBRE EL CUERPO: textWithTimeout / jsonWithTimeout en
 *     TODAS las respuestas (TMDB, /api/rest search|single|episodes|player y
 *     paginas de Vimeos/GoodStream/StreamWish/VidHide/Filemoon/VideoApp).
 *     Headers 200 con cuerpo colgado ya no congelan la cadena.
 *  5) FALLOS DE RED RESUELVEN null (no rechazan): fetchWithTimeout ahora
 *     resuelve null en timeout/error y todos los call sites toleran null
 *     (if (!res || !res.ok)), igual que en cinecalidad/lamovie/pelisforte.
 *  6) DIAGNOSTICO: rastro por console.error (NuvioTV/FireOS silencia
 *     console.log) + CONTRATO GARANTIZADO: getStreams SIEMPRE devuelve una
 *     Promesa que resuelve a Array (try/catch sincrono + catch final).
 *  7) LOGICA DE SCRAPING INTACTA (v2.2, verificada en vivo 2026-11 contra
 *     hackstore2.com/api/rest): busqueda /search por post_type, slugs candidatos
 *     (temporada-N-episodio-M / NxM / movie-year), scoring con anio (+20/-45),
 *     /single por post_name, /episodes por post_id de la serie, /player por
 *     post_id, resolvers Vimeos/GoodStream/StreamWish/VidHide/Filemoon (unpack
 *     Dean Edwards + m3u8) y VideoApp (iframe -> dispatcher). Verificado:
 *     Matrix resurrecciones -> Vimeos + VideoApp(->Vimeos); The Last of Us
 *     S1E1 -> Vimeos + VideoApp. Mapa de calidad por tags .urlset propio de
 *     cada servidor y probe RESOLUTION intactos.
 */

var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var BASE_URL = "https://hackstore2.com";
var API_URL = BASE_URL + "/api/rest";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
var NETWORK_TIMEOUT = 2500;

var LOG_TAG = "[Hackstore][v2.3]";

var DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json, text/plain, */*",
    "Referer": BASE_URL + "/",
    "Origin": BASE_URL
};

// ==========================================
// 1. CONTROL DE CONCURRENCIA Y TIMEOUTS (HERMES / QUICKJS SAFE)
// En NuvioTV (QuickJS) NO existe setTimeout ni AbortController: OkHttp ya
// corta cada peticion (30s connect / 30s read) y el runtime mata el plugin
// a los 60s.
// ==========================================

var HAS_TIMER = (typeof setTimeout === "function");
var HAS_ABORT = (typeof AbortController === "function");
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

function textWithTimeout(res, timeoutMs) {
    if (!res || typeof res.text !== "function") return Promise.resolve(null);
    if (!HAS_TIMER) {
        try {
            return res.text().then(function(t) { return t; }).catch(function() { return null; });
        } catch (e3) {
            return Promise.resolve(null);
        }
    }
    var limit = timeoutMs || 3000;
    return new Promise(function(resolve, reject) {
        var done = false;
        var timer = setTimeout(function() {
            if (!done) { done = true; reject(new Error("Body timeout")); }
        }, limit);
        try {
            res.text().then(function(t) {
                if (!done) { done = true; clearTimeout(timer); resolve(t); }
            }).catch(function(e) {
                if (!done) { done = true; clearTimeout(timer); reject(e); }
            });
        } catch (e) {
            if (!done) { done = true; clearTimeout(timer); reject(e); }
        }
    });
}

function jsonWithTimeout(res, timeoutMs) {
    if (!res || typeof res.json !== "function") return Promise.resolve(null);
    if (!HAS_TIMER) {
        try {
            return res.json().then(function(j) { return j; }).catch(function() { return null; });
        } catch (e4) {
            return Promise.resolve(null);
        }
    }
    var limit = timeoutMs || 3000;
    return new Promise(function(resolve, reject) {
        var done = false;
        var timer = setTimeout(function() {
            if (!done) { done = true; reject(new Error("Body timeout")); }
        }, limit);
        try {
            res.json().then(function(j) {
                if (!done) { done = true; clearTimeout(timer); resolve(j); }
            }).catch(function(e) {
                if (!done) { done = true; clearTimeout(timer); reject(e); }
            });
        } catch (e) {
            if (!done) { done = true; clearTimeout(timer); reject(e); }
        }
    });
}

function fetchWithTimeout(url, options, timeoutMs) {
    if (tvRemaining() < 400) {
        logDiag("presupuesto agotado, fetch cancelado: " + url);
        return Promise.resolve(null);
    }

    var fetchOpts = {};
    if (options) {
        for (var key in options) {
            if (Object.prototype.hasOwnProperty.call(options, key)) {
                fetchOpts[key] = options[key];
            }
        }
    }

    var controller = null;
    if (HAS_TIMER && HAS_ABORT) {
        // AbortController solo donde existe (Hermes/PC/Node): en QuickJS no hay.
        try {
            controller = new AbortController();
            fetchOpts.signal = controller.signal;
        } catch (eA) {
            controller = null;
        }
    }

    var fetchPromise = null;
    try {
        fetchPromise = fetch(url, fetchOpts);
        if (!fetchPromise || typeof fetchPromise.then !== "function") {
            fetchPromise = Promise.reject(new Error("fetch sin promesa"));
        }
    } catch (eSync) {
        return Promise.resolve(null);
    }

    if (!HAS_TIMER) {
        // NuvioTV: sin timer ni AbortController JS posible. OkHttp (30s/30s)
        // es el limite real. Errores/timeout -> null (contrato de esta capa).
        return fetchPromise
            .then(function(res) { return res; })
            .catch(function() { return null; });
    }

    var limit = timeoutMs || NETWORK_TIMEOUT;
    if (limit > tvRemaining()) limit = tvRemaining();
    var timer = null;

    var timeoutPromise = new Promise(function(_, reject) {
        timer = setTimeout(function() {
            if (controller) {
                try { controller.abort(); } catch (eAbort) {}
            }
            reject(new Error("Timeout"));
        }, limit);
    });

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

// ==========================================
// 2. UTILIDADES Y NORMALIZACIÓN (v2.2 intacto)
// ==========================================

function padZero(num) {
    var n = parseInt(num, 10) || 0;
    return n < 10 ? "0" + n : String(n);
}

function normalizeText(text) {
    if (!text) return "";
    return text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .trim();
}

function cleanTitle(str) {
    if (!str) return "";
    return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function scoreCandidate(slug, titles, year) {
    if (!slug) return 0;
    var cleanS = cleanTitle(slug);
    if (!cleanS) return 0;

    var slugWords = cleanS.split(/\s+/);
    var score = 0;

    for (var i = 0; i < titles.length; i++) {
        var t = cleanTitle(titles[i]);
        if (!t) continue;

        if (cleanS === t || (year && cleanS === t + " " + String(year))) {
            score = Math.max(score, 100);
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
            var ratio = (matches / targetWords.length) * 75;
            score = Math.max(score, ratio);
        }
    }

    if (score > 0 && year) {
        var targetYear = parseInt(year, 10);
        var yearMatches = cleanS.match(/\b(19\d{2}|20\d{2})\b/g);

        if (yearMatches && yearMatches.length > 0) {
            var hasExactOrClose = false;
            var hasForeignMismatch = false;

            for (var y = 0; y < yearMatches.length; y++) {
                var yrStr = yearMatches[y];
                var foundY = parseInt(yrStr, 10);

                if (Math.abs(foundY - targetYear) <= 1) {
                    hasExactOrClose = true;
                } else {
                    var inTitle = false;
                    for (var k = 0; k < titles.length; k++) {
                        if (String(titles[k]).indexOf(yrStr) !== -1) {
                            inTitle = true;
                            break;
                        }
                    }
                    if (!inTitle) hasForeignMismatch = true;
                }
            }

            if (hasExactOrClose) {
                score += 20;
            } else if (hasForeignMismatch) {
                score -= 45;
            }
        }
    }

    return score;
}

function unpackDeanEdwards(p, a, c, k) {
    var dict = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    function decodeBase(val, radix) {
        var res = 0;
        for (var i = 0; i < val.length; i++) {
            var idx = dict.indexOf(val[i]);
            if (idx === -1) return NaN;
            res = res * radix + idx;
        }
        return res;
    }
    return p.replace(/\b([0-9a-zA-Z]+)\b/g, function(token) {
        var index = decodeBase(token, a);
        if (isNaN(index) || index >= k.length) return token;
        return (k[index] && k[index] !== "") ? k[index] : token;
    });
}

function extractM3u8FromHtml(html) {
    if (!html) return null;

    var packRegex = /eval\(function\(p,a,c,k,e,[a-z]\)\{[\s\S]*?\}\((['"])([\s\S]+?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]+?)\5\.split\(/i;
    var packMatch = html.match(packRegex);

    if (packMatch) {
        var unpacked = unpackDeanEdwards(
            packMatch[2],
            parseInt(packMatch[3], 10),
            parseInt(packMatch[4], 10),
            packMatch[6].split("|")
        );
        if (unpacked) {
            var cleanUnpacked = unpacked.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\//g, "/");
            var packedM3u8 = cleanUnpacked.match(/["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i) ||
                             cleanUnpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>\\]*/i);
            if (packedM3u8) return packedM3u8[1] || packedM3u8[0];
        }
    }

    var cleanHtml = html.replace(/\\\//g, "/");
    var directMatch = cleanHtml.match(/(?:file|source|src)\s*:\s*["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i) ||
                      cleanHtml.match(/["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i) ||
                      cleanHtml.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>\\]*/i);

    return directMatch ? (directMatch[1] || directMatch[0]) : null;
}

// ==========================================
// 3. DETECCIÓN DINÁMICA DE RESOLUCIÓN (v2.2 intacto)
// ==========================================

var QUALITY_MAPS = {
    vimeos:     { x: "1080p", o: "1080p", h: "720p", n: "480p", l: "360p" },
    goodstream: { x: "1080p", o: "1080p", h: "720p", n: "480p", l: "360p" },
    vidhide:    { x: "1080p", o: "1080p", h: "1080p", n: "720p", l: "480p" },
    streamwish: { x: "1080p", o: "1080p", h: "1080p", n: "720p", l: "480p" }
};

var QUALITY_ORDER = ["x", "o", "h", "n", "l"];

function detectQualityFromUrl(url) {
    if (!url) return null;
    var u = url.toLowerCase();

    var qMap = null;
    if (u.indexOf("goodstream") !== -1) qMap = QUALITY_MAPS.goodstream;
    else if (u.indexOf("vimeos") !== -1) qMap = QUALITY_MAPS.vimeos;
    else if (u.indexOf("vidhide") !== -1 || u.indexOf("minochinos") !== -1 || u.indexOf("morencius") !== -1) qMap = QUALITY_MAPS.vidhide;
    else if (u.indexOf("streamwish") !== -1 || u.indexOf("hlswish") !== -1 || u.indexOf("vibuxer") !== -1) qMap = QUALITY_MAPS.streamwish;

    if (qMap) {
        var urlsetMatch = u.match(/[,_]([a-z,]+)[,_]\.urlset/);
        if (urlsetMatch) {
            var tags = urlsetMatch[1].split(",");
            for (var i = 0; i < QUALITY_ORDER.length; i++) {
                var tag = QUALITY_ORDER[i];
                if (tags.indexOf(tag) !== -1 && qMap[tag]) {
                    return qMap[tag];
                }
            }
        }
    }

    // Evaluar únicamente sobre el path para evitar falsos positivos con hashes/tokens en query params
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

    if (!m3u8Url || m3u8Url.indexOf(".m3u8") === -1) return Promise.resolve("720p");

    return fetchWithTimeout(m3u8Url, {
        headers: headers || { "User-Agent": USER_AGENT },
        redirect: "follow"
    }, 2500)
    .then(function(res) {
        if (!res || !res.ok) return "";
        return textWithTimeout(res, 2500);
    })
    .then(function(text) {
        if (!text || text.indexOf("#EXT-X-STREAM-INF") === -1) {
            var pathOnly = m3u8Url.split("?")[0];
            if (/(?:^|[^a-z0-9])1080p?(?:[^a-z0-9]|$)/i.test(pathOnly)) return "1080p";
            if (/(?:^|[^a-z0-9])720p?(?:[^a-z0-9]|$)/i.test(pathOnly)) return "720p";
            return "720p";
        }

        var maxW = 0;
        var maxH = 0;
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
        return "720p";
    })
    .catch(function() {
        return "720p";
    });
}

function getServerLabel(url) {
    if (!url) return "Online";
    var u = url.toLowerCase();
    if (u.indexOf("vimeos") !== -1) return "Vimeos";
    if (u.indexOf("goodstream") !== -1) return "GoodStream";
    if (u.indexOf("streamwish") !== -1 || u.indexOf("hlswish") !== -1 || u.indexOf("strwish") !== -1 || u.indexOf("hanerix") !== -1 || u.indexOf("hglink") !== -1 || u.indexOf("vibuxer") !== -1 || u.indexOf("flaswish") !== -1) return "StreamWish";
    if (u.indexOf("vidhide") !== -1 || u.indexOf("minochinos") !== -1 || u.indexOf("morencius") !== -1 || u.indexOf("callistanise") !== -1) return "VidHide";
    if (u.indexOf("filemoon") !== -1) return "Filemoon";
    if (u.indexOf("videoapp") !== -1) return "Videoapp";
    return "Servidor";
}

// ==========================================
// 4. RESOLVERS DE STREAMING (PROMESAS PURAS, tolerantes a res null)
// ==========================================

function resolveVimeos(url) {
    return fetchWithTimeout(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": "https://vimeos.net/" },
        redirect: "follow"
    }, 2500)
    .then(function(res) { return (res && res.ok) ? textWithTimeout(res, 2500) : ""; })
    .then(function(html) {
        if (!html) return null;
        var streamUrl = extractM3u8FromHtml(html);
        if (!streamUrl) return null;

        var headers = { "User-Agent": USER_AGENT, "Referer": "https://vimeos.net/" };
        return probeM3u8Quality(streamUrl, headers).then(function(q) {
            return {
                url: streamUrl,
                quality: q || "720p",
                headers: headers
            };
        });
    })
    .catch(function() { return null; });
}

function resolveGoodStream(url) {
    return fetchWithTimeout(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": "https://goodstream.one/" },
        redirect: "follow"
    }, 2500)
    .then(function(res) { return (res && res.ok) ? textWithTimeout(res, 2500) : ""; })
    .then(function(html) {
        if (!html) return null;
        var streamUrl = extractM3u8FromHtml(html);
        if (!streamUrl) return null;

        var headers = { "User-Agent": USER_AGENT, "Referer": url, "Origin": "https://goodstream.one" };
        return probeM3u8Quality(streamUrl, headers).then(function(q) {
            return {
                url: streamUrl,
                quality: q || "720p",
                headers: headers
            };
        });
    })
    .catch(function() { return null; });
}

function resolveStreamWish(url) {
    var targetUrl = url;
    if (targetUrl.indexOf("hglink.to") !== -1 || targetUrl.indexOf("hanerix.com") !== -1 || targetUrl.indexOf("vibuxer.com") !== -1) {
        var idMatch = targetUrl.match(/\/(?:e|f|v)\/([a-zA-Z0-9]+)/);
        if (idMatch) targetUrl = "https://hlswish.com/e/" + idMatch[1];
    }

    return fetchWithTimeout(targetUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/" },
        redirect: "follow"
    }, 2500)
    .then(function(res) { return (res && res.ok) ? textWithTimeout(res, 2500) : ""; })
    .then(function(html) {
        if (!html) return null;
        var streamUrl = extractM3u8FromHtml(html);
        if (!streamUrl) return null;

        var headers = { "User-Agent": USER_AGENT, "Referer": targetUrl };
        return probeM3u8Quality(streamUrl, headers).then(function(q) {
            return {
                url: streamUrl,
                quality: q || "720p",
                headers: headers
            };
        });
    })
    .catch(function() { return null; });
}

function resolveVidHide(url) {
    return fetchWithTimeout(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/" },
        redirect: "follow"
    }, 2500)
    .then(function(res) { return (res && res.ok) ? textWithTimeout(res, 2500) : ""; })
    .then(function(html) {
        if (!html) return null;
        var streamUrl = extractM3u8FromHtml(html);
        if (!streamUrl) return null;

        var headers = { "User-Agent": USER_AGENT, "Referer": url };
        return probeM3u8Quality(streamUrl, headers).then(function(q) {
            return {
                url: streamUrl,
                quality: q || "720p",
                headers: headers
            };
        });
    })
    .catch(function() { return null; });
}

function resolveFilemoon(url) {
    return fetchWithTimeout(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": url },
        redirect: "follow"
    }, 2500)
    .then(function(res) { return (res && res.ok) ? textWithTimeout(res, 2500) : ""; })
    .then(function(html) {
        if (!html) return null;
        var streamUrl = extractM3u8FromHtml(html);
        if (!streamUrl) return null;

        var headers = { "User-Agent": USER_AGENT, "Referer": url };
        return probeM3u8Quality(streamUrl, headers).then(function(q) {
            return {
                url: streamUrl,
                quality: q || "720p",
                headers: headers
            };
        });
    })
    .catch(function() { return null; });
}

function resolveVideoApp(url) {
    return fetchWithTimeout(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/" },
        redirect: "follow"
    }, 2500)
    .then(function(res) { return (res && res.ok) ? textWithTimeout(res, 2500) : ""; })
    .then(function(html) {
        if (!html) return null;
        var iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
        if (iframeMatch) {
            return dispatchResolver(iframeMatch[1]);
        }
        return null;
    })
    .catch(function() { return null; });
}

function dispatchResolver(url) {
    if (!url) return Promise.resolve(null);
    var u = url.toLowerCase();

    if (u.indexOf("vimeos") !== -1) return resolveVimeos(url);
    if (u.indexOf("goodstream") !== -1) return resolveGoodStream(url);
    if (u.indexOf("hlswish") !== -1 || u.indexOf("streamwish") !== -1 || u.indexOf("strwish") !== -1 || u.indexOf("hanerix") !== -1 || u.indexOf("hglink") !== -1 || u.indexOf("vibuxer") !== -1 || u.indexOf("flaswish") !== -1) return resolveStreamWish(url);
    if (u.indexOf("vidhide") !== -1 || u.indexOf("minochinos") !== -1 || u.indexOf("morencius") !== -1 || u.indexOf("callistanise") !== -1) return resolveVidHide(url);
    if (u.indexOf("filemoon") !== -1) return resolveFilemoon(url);
    if (u.indexOf("videoapp") !== -1) return resolveVideoApp(url);

    return Promise.resolve(null);
}

// ==========================================
// 5. CLIENTE API REST (CONCURRENTE EN LOTES, tolerante a res null)
// ==========================================

function getPostId(slugs, postType) {
    var slugList = Array.isArray(slugs) ? slugs : [slugs];
    if (slugList.length === 0) return Promise.resolve(null);

    var batchSize = 3;
    function tryBatch(startIndex) {
        if (startIndex >= slugList.length) return Promise.resolve(null);
        var currentBatch = slugList.slice(startIndex, startIndex + batchSize);

        var promises = currentBatch.map(function(slug) {
            var endpoint = API_URL + "/single?post_name=" + encodeURIComponent(slug) + "&post_type=" + postType;
            return fetchWithTimeout(endpoint, { headers: DEFAULT_HEADERS, redirect: "follow" }, 2500)
                .then(function(res) {
                    if (!res || !res.ok) return null;
                    return jsonWithTimeout(res, 2500);
                })
                .then(function(json) {
                    if (!json || !json.data) return null;
                    var d = json.data;
                    if (postType === "episodes" && d.episode && d.episode._id) return d.episode._id;
                    if (d._id) return d._id;
                    return null;
                })
                .catch(function() { return null; });
        });

        return Promise.all(promises).then(function(results) {
            for (var i = 0; i < results.length; i++) {
                if (results[i]) return results[i];
            }
            return tryBatch(startIndex + batchSize);
        });
    }

    return tryBatch(0);
}

function getEpisodeIdFromSeries(baseSlugs, sNum, eNum) {
    return getPostId(baseSlugs, "tvshows").then(function(seriesId) {
        if (!seriesId) return null;

        var endpoint = API_URL + "/episodes?post_id=" + seriesId;
        return fetchWithTimeout(endpoint, { headers: DEFAULT_HEADERS, redirect: "follow" }, 2500)
            .then(function(res) {
                if (!res || !res.ok) return null;
                return jsonWithTimeout(res, 2500);
            })
            .then(function(json) {
                var list = (json && Array.isArray(json.data)) ? json.data : [];
                for (var i = 0; i < list.length; i++) {
                    var ep = list[i];
                    if (parseInt(ep.season_number, 10) === sNum && parseInt(ep.episode_number, 10) === eNum) {
                        return ep._id || null;
                    }
                }
                return null;
            })
            .catch(function() { return null; });
    });
}

function searchHackstoreApi(queries, titles, year, postType) {
    var qList = Array.isArray(queries) ? queries : [queries];
    var pType = postType || "movies";

    function tryNext(index) {
        if (index >= qList.length) return Promise.resolve(null);
        var q = qList[index];
        var cleanQ = q.length > 15 ? q.substring(0, 15) : q;
        if (cleanQ.length < 3) return tryNext(index + 1);

        var searchUrl = API_URL + "/search?post_type=" + pType + "&query=" + encodeURIComponent(cleanQ);

        return fetchWithTimeout(searchUrl, { headers: DEFAULT_HEADERS }, 2500)
            .then(function(res) {
                if (!res || !res.ok) return null;
                return jsonWithTimeout(res, 2500);
            })
            .then(function(json) {
                var posts = (json && json.data && Array.isArray(json.data.posts)) ? json.data.posts : [];
                var bestId = null;
                var bestScore = 0;

                for (var i = 0; i < posts.length; i++) {
                    var p = posts[i];
                    var s = p.slug || p.post_name || p.title;
                    var sc = scoreCandidate(s, titles, year);
                    if (sc >= 35 && sc > bestScore) {
                        bestScore = sc;
                        bestId = p._id;
                    }
                }

                if (bestId) {
                    logDiag("search '" + cleanQ + "' -> id " + bestId + " (score " + bestScore + ")");
                    return bestId;
                }
                return tryNext(index + 1);
            })
            .catch(function() {
                return tryNext(index + 1);
            });
    }

    return tryNext(0);
}

function getPlayerEmbeds(postId) {
    var endpoint = API_URL + "/player?post_id=" + postId;
    return fetchWithTimeout(endpoint, { headers: DEFAULT_HEADERS, redirect: "follow" }, 2500)
        .then(function(res) {
            if (!res || !res.ok) return [];
            return jsonWithTimeout(res, 2500);
        })
        .then(function(json) {
            return (json && json.data && Array.isArray(json.data)) ? json.data : [];
        })
        .catch(function() { return []; });
}

// ==========================================
// 6. FUNCIÓN PRINCIPAL EXPORTADA
// ==========================================

function getStreamsInner(tmdbId, mediaType, season, episode) {
    var isMovie = mediaType === "movie";
    var sNum = parseInt(season, 10) || 1;
    var eNum = parseInt(episode, 10) || 1;
    var epPadded = padZero(eNum);
    var tmdbUrl = "https://api.themoviedb.org/3/" + (isMovie ? "movie" : "tv") + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=es-MX&append_to_response=alternative_titles";

    return fetchWithTimeout(tmdbUrl, {}, 2500)
        .then(function(res) {
            if (!res || !res.ok) throw new Error("TMDB HTTP " + (res ? res.status : "null"));
            return jsonWithTimeout(res, 2500);
        })
        .then(function(meta) {
            if (!meta) throw new Error("TMDB JSON vacio");
            var title = isMovie ? (meta.title || meta.original_title) : (meta.name || meta.original_name);
            var origTitle = isMovie ? meta.original_title : meta.original_name;
            var year = (isMovie ? meta.release_date : meta.first_air_date || "").slice(0, 4);

            logDiag("TMDB ok: '" + (title || "?") + "' (" + year + ") " + (isMovie ? "movie" : "S" + sNum + "E" + eNum) + " timer=" + HAS_TIMER);

            var titles = [];
            if (!isMovie && origTitle) {
                titles.push(origTitle);
                if (title && title !== origTitle) titles.push(title);
            } else {
                if (title) titles.push(title);
                if (origTitle && origTitle !== title) titles.push(origTitle);
            }

            var altArr = (meta.alternative_titles && (meta.alternative_titles.results || meta.alternative_titles.titles)) || [];
            for (var i = 0; i < altArr.length; i++) {
                if (altArr[i].title && titles.indexOf(altArr[i].title) === -1) {
                    titles.push(altArr[i].title);
                }
            }

            var searchQueries = [];
            var fullSlugs = [];
            var shortSlugs = [];

            for (var j = 0; j < titles.length; j++) {
                var rawT = titles[j];
                if (!rawT) continue;

                var clean = cleanTitle(rawT);
                if (clean && searchQueries.indexOf(clean) === -1) searchQueries.push(clean);

                var sNorm = normalizeText(rawT);
                if (sNorm && fullSlugs.indexOf(sNorm) === -1) fullSlugs.push(sNorm);

                if (rawT.indexOf("&") !== -1) {
                    var withY = normalizeText(rawT.replace(/&/g, " y "));
                    if (withY && fullSlugs.indexOf(withY) === -1) fullSlugs.push(withY);

                    var withAnd = normalizeText(rawT.replace(/&/g, " and "));
                    if (withAnd && fullSlugs.indexOf(withAnd) === -1) fullSlugs.push(withAnd);
                }

                var shortNorm = normalizeText(rawT.split(/[:\-\(]/)[0]);
                if (shortNorm && shortSlugs.indexOf(shortNorm) === -1 && fullSlugs.indexOf(shortNorm) === -1) {
                    shortSlugs.push(shortNorm);
                }
            }

            var baseSlugs = fullSlugs.concat(shortSlugs);
            var candidateSlugs = [];

            for (var b = 0; b < baseSlugs.length; b++) {
                var bSlug = baseSlugs[b];
                if (isMovie) {
                    if (year) candidateSlugs.push(bSlug + "-" + year);
                    candidateSlugs.push(bSlug);
                } else {
                    candidateSlugs.push(bSlug + "-temporada-" + sNum + "-episodio-" + eNum);
                    candidateSlugs.push(bSlug + "-temporada-" + sNum + "-episodio-" + epPadded);
                    candidateSlugs.push(bSlug + "-" + sNum + "x" + eNum);
                    candidateSlugs.push(bSlug + "-" + sNum + "x" + epPadded);
                }
            }

            var postType = isMovie ? "movies" : "episodes";
            return getPostId(candidateSlugs, postType).then(function(postId) {
                if (postId) {
                    logDiag("postId por slug: " + postId);
                    return postId;
                }

                if (isMovie) {
                    return searchHackstoreApi(searchQueries, titles, year, "movies");
                }

                // Fallback de series vía ficha tvshows + /api/rest/episodes
                return getEpisodeIdFromSeries(baseSlugs, sNum, eNum);
            });
        })
        .then(function(postId) {
            if (!postId) {
                logDiag("sin postId tras slugs + fallback (" + Math.round(tvElapsed()) + "ms)");
                return [];
            }
            return getPlayerEmbeds(postId);
        })
        .then(function(embeds) {
            if (!embeds.length) {
                logDiag("sin embeds en /player");
                return [];
            }

            logDiag("embeds en /player: " + embeds.length + " (" + Math.round(tvElapsed()) + "ms)");

            var promises = embeds.map(function(embed) {
                var url = embed.url || embed.link || "";
                var lang = embed.lang || embed.language || "LAT";
                var serverName = getServerLabel(url);

                return dispatchResolver(url)
                    .then(function(result) {
                        if (!result || !result.url) return null;
                        var qual = result.quality || "720p";
                        logDiag("resolver " + serverName + " -> OK " + qual);
                        return {
                            name: "Hackstore",
                            title: qual + " · " + lang.toUpperCase() + " · " + serverName,
                            quality: qual,
                            url: result.url,
                            headers: result.headers || {}
                        };
                    })
                    .catch(function() { return null; });
            });

            return Promise.all(promises);
        })
        .then(function(results) {
            var valid = results.filter(function(st) { return st !== null; });
            logDiag("total " + valid.length + " streams (" + Math.round(tvElapsed()) + "ms)");
            return valid;
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
        logDiag("getStreams tmdbId=" + tmdbId + " type=" + mediaType + " s=" + season + " e=" + episode);
        if (!tmdbId) return Promise.resolve([]);
        return getStreamsInner(tmdbId, mediaType, season, episode);
    } catch (eSync) {
        return Promise.resolve([]);
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { getStreams: getStreams };
}
