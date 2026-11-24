/**
 * Provider: Cinezo (Películas y Series — TMDB-ID directo, HLS propio)
 * Dominio:  https://www.cinezo.st
 * Player:   https://player.cinezo.live/embed/movie/<tmdbId> | /embed/tv/<tmdbId>/<s>/<e>
 * Motor:    100% Cadenas de Promesas (Hermes / QuickJS / NuvioTV Firestick Safe)
 *
 * ARQUITECTURA (reverse verificado en sandbox, 2026-11):
 *  - Cinezo NO necesita búsqueda por título: su catálogo se direcciona por ID de TMDB
 *    (página /watch/movie/<tmdbId> y iframe player.cinezo.live/embed/movie/<tmdbId>).
 *  - El player interno es un fork de P-Stream: sus fuentes se exponen como JSON público:
 *      Jennifer 4K : https://punkflix.net/movie/<tmdbId>.json
 *                    https://punkflix.net/tv/<tmdbId>/<s>/<e>.json
 *      Flikhub     : https://proxy1.flikhub.net/movie?id=<tmdbId>&mode=json&sources=berlin&hevc=1
 *                    https://proxy1.flikhub.net/tv?id=<tmdbId>&season=<s>&episode=<e>&mode=json&...
 *  - El JSON devuelve stream.hls / stream.original (m3u8 directo, tokens firmados,
 *    expira en 14400 s) y quality.resolution ("1920x1080") para Regla 7.
 *  - punkflix verificado: Inception 3840x1600, Blade Runner 2049 1920x1080,
 *    Game of Thrones 1x1 1920x1080. flikhub/proxy.yenime pueden estar bloqueados
 *    por IP de datacenter; desde IP residencial (Fire TV) responden — quedan como
 *    fuente secundaria con aislamiento total (.catch -> null).
 *  - Regla 6 (TMDB): aquí NO aplica matching por título (el sitio direcciona por ID);
 *    TMDB solo aporta título/año para las etiquetas de stream. Si TMDB falla, el
 *    flujo continúa con etiquetas genéricas.
 *
 * v1.0 — Primera entrega.
 *  - Capa de red calcada de SoloLatino v1.3 (a su vez calcada de JKAnime, verificado
 *    en NuvioTV Firestick 4K): fetchWithTimeout nunca rechaza (timeout/error -> null),
 *    bodyWithTimeout para toda lectura .text()/.json(), isResOk acepta 200-299.
 *  - Sin AbortController, sin dependencias, ES5 estricto (Reglas 1-4).
 *  - Deadline 10000 ms (Regla 4) acotando SOLO la fase de profundización
 *    (sondas HLS); la cadena principal nunca se corta por deadline.
 *  - Regla 7: quality.resolution del JSON -> classifyResolution; si no viene,
 *    sonda HLS lee RESOLUTION=WxH del manifiesto (máx 2 sondas, 2500 ms).
 *  - Regla 8: cada fuente aislada (.catch -> null), dedupe por URL final.
 *
 *  ⚠ NuvioTV: cada vez que cambie este archivo hay que SUBIR el campo "version"
 *    de manifest.json (NuvioTV cachea el bytecode QuickJS por versión).
 */

var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var BASE_URL = "https://www.cinezo.st";
var PLAYER_HOST = "https://player.cinezo.live";
var PUNKFLIX_HOST = "https://punkflix.net";
var FLIKHUB_HOST = "https://proxy1.flikhub.net";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var NETWORK_TIMEOUT = 2800;      // Regla 4: 2400–2800 ms (valor JKAnime/Firestick OK)
var GLOBAL_DEADLINE_MS = 10000;  // Regla 4: presupuesto SOLO de sondas/profundización
var HLS_PROBE_TIMEOUT = 2500;    // valor JKAnime (Firestick OK)
var MAX_HLS_PROBES = 2;
var MAX_BODY_CHARS = 1000000;    // Regla 4: tope ~1 MB por respuesta
var FLIKHUB_SOURCES = ["berlin", "jennifer", "sadie", "scarlet", "zendaya"];

var DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-MX,es;q=0.9,en;q=0.8",
    "Referer": PLAYER_HOST + "/"
};

// ==========================================
// 1. HELPERS DE RED (HERMES / TV SAFE — capa SoloLatino v1.3 / JKAnime)
// ==========================================

function fetchWithTimeout(url, options, timeoutMs) {
    var limit = timeoutMs || NETWORK_TIMEOUT;
    var timer = null;

    var timeoutPromise = new Promise(function (_, reject) {
        timer = setTimeout(function () {
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
        .then(function (res) {
            if (timer) clearTimeout(timer);
            return res;
        })
        .catch(function () {
            if (timer) clearTimeout(timer);
            return null;
        });
}

// Regla 4: el body también puede colgarse tras recibir headers HTTP 200.
function bodyWithTimeout(res, method, timeoutMs) {
    var limit = timeoutMs || NETWORK_TIMEOUT;
    return new Promise(function (resolve) {
        var settled = false;
        var timer = setTimeout(function () {
            if (!settled) { settled = true; resolve(null); }
        }, limit);
        try {
            res[method]().then(function (data) {
                if (!settled) { settled = true; clearTimeout(timer); resolve(data); }
            }).catch(function () {
                if (!settled) { settled = true; clearTimeout(timer); resolve(null); }
            });
        } catch (e) {
            if (!settled) { settled = true; clearTimeout(timer); resolve(null); }
        }
    });
}

function textWithTimeout(res, timeoutMs) {
    return bodyWithTimeout(res, "text", timeoutMs).then(function (txt) {
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

// ==========================================
// 2. CALIDAD (Regla 7)
// ==========================================

// Clasifica por ANCHO y ALTO; umbrales idénticos a JKAnime/SoloLatino.
function classifyResolution(w, h) {
    if (w >= 3840 || h >= 2160) return "4K";
    if (w >= 1920 || h >= 1080) return "1080p";
    if (w >= 1280 || h >= 720) return "720p";
    if (w >= 854 || h >= 480) return "480p";
    return "Auto";
}

function detectQuality(url, label) {
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

// Regla 7: lee RESOLUTION=WxH del manifiesto en vez de asumir master.m3u8 = 1080p.
function probeHlsQuality(url, referer) {
    return fetchWithTimeout(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": referer || PLAYER_HOST + "/" },
        redirect: "follow"
    }, HLS_PROBE_TIMEOUT)
        .then(function (res) {
            if (!isResOk(res)) return "";
            return textWithTimeout(res, HLS_PROBE_TIMEOUT);
        })
        .then(function (txt) {
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
        .catch(function () { return ""; });
}

// ==========================================
// 3. PARSER DE JSON DE FUENTES (punkflix / flikhub — mismo esquema)
// ==========================================

// Extrae el stream reproducible del JSON de la fuente. Formato verificado:
//   { "stream": { "original": "...", "hls": "...index.m3u8?t=...&s=..." },
//     "quality": { "resolution": "1920x1080" }, "title": "...", "year": ... }
// flikhub puede traer variaciones; se parsea con tolerancia (Regla 8).
function extractSourceFromJson(data) {
    if (!data || typeof data !== "object") return null;

    var stream = data.stream || {};
    var rawUrl = stream.hls || stream.original || stream.url || data.url || "";
    if (typeof rawUrl !== "string" || rawUrl.length < 12) return null;
    if (rawUrl.indexOf("http") !== 0 && rawUrl.indexOf("//") !== 0) return null;
    if (rawUrl.indexOf("//") === 0) rawUrl = "https:" + rawUrl;

    // Regla 7: la fuente reporta su propia resolución.
    var res = (data.quality && data.quality.resolution) || "";
    var qual = "";
    var resM = String(res).match(/(\d+)\s*x\s*(\d+)/i);
    if (resM) {
        qual = classifyResolution(parseInt(resM[1], 10), parseInt(resM[2], 10));
    }

    // Etiqueta del servidor: el JSON no la trae; la fijamos por dominio del endpoint.
    return {
        url: rawUrl,
        isHls: /\.m3u8(\?|#|$)/i.test(rawUrl) || rawUrl.indexOf(".m3u8") !== -1,
        quality: qual,
        resolution: res
    };
}

function fetchSourceJson(url, referer) {
    return fetchWithTimeout(url, {
        headers: {
            "User-Agent": USER_AGENT,
            "Accept": "application/json,text/plain,*/*",
            "Referer": referer || PLAYER_HOST + "/"
        },
        redirect: "follow"
    }, NETWORK_TIMEOUT)
        .then(function (res) {
            if (!isResOk(res)) return null;
            return jsonWithTimeout(res, NETWORK_TIMEOUT);
        })
        .then(function (data) {
            if (!data) return null;
            return extractSourceFromJson(data);
        })
        .catch(function () { return null; });
}

// Fuente primaria: punkflix.net ( Jennifer 4K ). URLs verificadas:
//   movie: /movie/<tmdbId>.json      tv: /tv/<tmdbId>/<s>/<e>.json
function resolvePunkflix(tmdbId, isMovie, sNum, eNum) {
    var urls = [];
    if (isMovie) {
        urls.push(PUNKFLIX_HOST + "/movie/" + tmdbId + ".json");
    } else {
        urls.push(PUNKFLIX_HOST + "/tv/" + tmdbId + "/" + sNum + "/" + eNum + ".json");
        // variante con episodio con cero (por si el backend indexa con padding)
        var epPadded = eNum < 10 ? "0" + eNum : String(eNum);
        if (epPadded !== String(eNum)) {
            urls.push(PUNKFLIX_HOST + "/tv/" + tmdbId + "/" + sNum + "/" + epPadded + ".json");
        }
    }

    function tryNext(idx) {
        if (idx >= urls.length) return Promise.resolve(null);
        return fetchSourceJson(urls[idx], PLAYER_HOST + "/").then(function (src) {
            if (src) return src;
            return tryNext(idx + 1);
        });
    }
    return tryNext(0);
}

// Fuente secundaria: proxy1.flikhub.net (misma familia; puede requerir IP residencial).
// .catch total: si falla NO afecta a punkflix (Regla 8).
function resolveFlikhub(tmdbId, isMovie, sNum, eNum, ctx) {
    var urls = [];
    for (var i = 0; i < FLIKHUB_SOURCES.length; i++) {
        var sName = FLIKHUB_SOURCES[i];
        if (isMovie) {
            urls.push(FLIKHUB_HOST + "/movie?id=" + tmdbId + "&mode=json&sources=" + sName + "&hevc=1");
        } else {
            urls.push(FLIKHUB_HOST + "/tv?id=" + tmdbId + "&season=" + sNum + "&episode=" + eNum + "&mode=json&sources=" + sName + "&hevc=1");
        }
    }

    function tryNext(idx) {
        if (idx >= urls.length) return Promise.resolve(null);
        if (ctxTimeLeft(ctx) < 2000) return Promise.resolve(null);
        return fetchSourceJson(urls[idx], PLAYER_HOST + "/").then(function (src) {
            if (src) return src;
            return tryNext(idx + 1);
        });
    }
    return tryNext(0);
}

// ==========================================
// 4. FUNCIÓN PRINCIPAL EXPORTADA (getStreams)
// ==========================================

function getStreams(tmdbId, mediaType, season, episode) {
    var isMovie = mediaType === "movie";

    // Regla 6: sanitizar tmdbId a solo dígitos.
    var tmdbIdStr = String(tmdbId === undefined || tmdbId === null ? "" : tmdbId).replace(/[^0-9]/g, "");
    if (!tmdbIdStr) return Promise.resolve([]);

    var sParsed = parseInt(season, 10);
    var sNum = isNaN(sParsed) ? 1 : sParsed;
    var eParsed = parseInt(episode, 10);
    var eNum = isNaN(eParsed) ? 1 : eParsed;

    var ctx = { deadline: 0, probes: 0 };

    // TMDB solo para etiqueta de stream (Cinezo direcciona por ID; Regla 6 no
    // aplica matching aquí). Si falla, seguimos con etiquetas genéricas.
    var tmdbUrl = "https://api.themoviedb.org/3/" + (isMovie ? "movie" : "tv") + "/" + tmdbIdStr +
        "?api_key=" + TMDB_API_KEY + "&language=es-MX";
    var metaPromise = fetchWithTimeout(tmdbUrl, null, 2500)
        .then(function (res) { return isResOk(res) ? jsonWithTimeout(res, 2500) : null; })
        .catch(function () { return null; });

    return metaPromise.then(function (meta) {
        var title = meta ? ((isMovie ? (meta.title || meta.original_title) : (meta.name || meta.original_name)) || "Contenido") : "Contenido";
        var cleanTitle = String(title).replace(/["<>|]/g, "").trim() || "Contenido";

        // Fuente primaria: punkflix (Jennifer 4K)
        return resolvePunkflix(tmdbIdStr, isMovie, sNum, eNum)
            .then(function (src) {
                if (src) return { src: src, label: "Jennifer 4K" };
                // Fuente secundaria: flikhub (aislada, tolerante)
                ctx.deadline = Date.now() + GLOBAL_DEADLINE_MS;
                return resolveFlikhub(tmdbIdStr, isMovie, sNum, eNum, ctx)
                    .then(function (src2) {
                        if (src2) return { src: src2, label: "Flikhub" };
                        return null;
                    });
            })
            .then(function (hit) {
                if (!hit || !hit.src || !hit.src.url) return [];

                var targetUrl = hit.src.url;
                var isMp4 = !hit.src.isHls;

                // Regla 7: calidad reportada por el JSON; si no vino, sonda HLS.
                var fallbackQual = hit.src.quality || detectQuality(targetUrl, hit.label);
                var canProbe = !isMp4 &&
                    targetUrl.indexOf(".m3u8") !== -1 &&
                    ctx.probes < MAX_HLS_PROBES &&
                    ctxTimeLeft(ctx) > 3000;

                function pushWith(qual) {
                    var epLabel = isMovie ? "" : " · T" + sNum + "E" + eNum;
                    return [{
                        name: "Cinezo",
                        title: qual + " · " + hit.label + " · " + cleanTitle + epLabel + (isMp4 ? " (MP4)" : ""),
                        quality: qual,
                        url: targetUrl,
                        headers: {
                            "User-Agent": USER_AGENT,
                            "Referer": PLAYER_HOST + "/"
                        }
                    }];
                }

                if (canProbe) {
                    ctx.probes++;
                    return probeHlsQuality(targetUrl, PLAYER_HOST + "/")
                        .then(function (detected) {
                            return pushWith(detected || fallbackQual);
                        })
                        .catch(function () { return pushWith(fallbackQual); });
                }
                return pushWith(fallbackQual);
            })
            .catch(function () { return []; });
    });
}

// Forma de export idéntica a JKAnime/SoloLatino (verificada en NuvioTV).
if (typeof module !== "undefined") {
    module.exports = { getStreams: getStreams };
}
