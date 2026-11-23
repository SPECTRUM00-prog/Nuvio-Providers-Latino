/**
 * Provider: Cinecalidad Oficial (www.cinecalidad.am)
 * Motor Híbrido:
 *   1. Streaming Online Directo: Vimeos (HLS 1080p / 720p dinámico)
 *   2. Streaming P2P / Torrents: Nuvio Engine / Stremio (Magnets Dual Latino 1080p / 720p)
 * Reglas Hermes: ES5 estricto, 100% Promesas, Zero-Dependencies, Fast Timeout (<= 2800ms)
 *
 * Cambios v2.4-NUVIOTV (2026-11) - capa runtime portada de jkanime v2.9 / sololatino v2.0:
 *  1) FIX CRITICO DE TV: el QuickJS de NuvioTV (dokar quickjs-kt + polyfill de
 *     PluginRuntime.kt) NO define setTimeout/clearTimeout. La v2.3 los usaba sin
 *     condition dentro de fetchWithTimeout -> el executor de la promesa lanzaba
 *     TypeError al instante, Promise.race rechazaba, el catch devolvia null para
 *     TODO fetch y getStreams devolvia [] SOLO en TV (en PC/Hermes funcionaba).
 *     Ahora HAS_TIMER detecta el runtime: si hay timer (Hermes movil / PC / Node)
 *     se conserva el timeout por llamada; si no hay (TV) fetch directo con el
 *     limite real de OkHttp (30s connect / 30s read).
 *  2) PRESUPUESTO GLOBAL Date.now() de 45s (el runtime mata el plugin a los 60s):
 *     cada fetch verifica tvRemaining() y se cancela con null si queda < 400ms,
 *     para que el provider devuelva lo que tenga en vez de morir con error.
 *  3) PUENTE __native_fetch (NuvioTV 1.1.1): fetch(url, options || {}) y
 *     try/catch sincrono: el puente puede rechazar opciones nulas o lanzar de
 *     forma sincrona, lo que cortaba la cadena completa en silencio.
 *  4) TIMEOUT TAMBIEN SOBRE EL CUERPO: textWithTimeout / jsonWithTimeout.
 *     Headers 200 con cuerpo colgado ya no congelan la cadena.
 *  5) CONTRATO GARANTIZADO: getStreams SIEMPRE devuelve una Promesa que resuelve
 *     a Array (try/catch sincrono + catch final); dedupe final por URL exacta.
 *  6) LOGICA DE SCRAPING INTACTA (v2.3, probada en produccion): busqueda /?s=,
 *     scoring de candidatos (umbral 35, anio +20), resolver Vimeos (unpack Dean
 *     Edwards + m3u8), torrents uTorrent (top 2, solo peliculas), deteccion de
 *     calidad por tags .urlset y probe RESOLUTION.
 *  7) SERIES CORREGIDAS (regresion del sitio, 2026-11): cinecalidad.am movio
 *     los episodios a /ver-el-episodio/{slug}-{s}x{e}/. La v2.3 construia
 *     {serie}-{s}x{e}/ sobre la URL de la serie y hoy responde 404 (verificado
 *     con The Last of Us). Ahora se extrae el enlace del episodio desde la
 *     pagina de la serie (match exacto -SxE, tolerando duplicados -SxE-2) y
 *     los embeds Vimeos se extraen de la pagina del episodio.
 */

var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var BASE_URL = "https://www.cinecalidad.am";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var NETWORK_TIMEOUT = 2800;

var LOG_TAG = "[CineCalidad][v2.4]";

// ==========================================
// 1. HELPERS DE RED & STRINGS (HERMES / QUICKJS SAFE)
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
    var timer = null;

    var timeoutPromise = new Promise(function(_, reject) {
        timer = setTimeout(function() {
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

var DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": BASE_URL + "/"
};

// ==========================================
// 2. NORMALIZACIÓN Y SCORING (v2.3 intacto)
// ==========================================

function cleanTitle(str) {
    if (!str) return "";
    var normalized = str;
    try {
        normalized = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    } catch (e) {}

    return normalized
        .toLowerCase()
        .replace(/[^a-z0-9\s]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function scoreCandidate(candidateUrl, candidateText, targetTitles, targetYear) {
    var cleanUrlText = cleanTitle(candidateUrl.replace(BASE_URL, "").replace(/\//g, " "));
    var cleanInnerText = cleanTitle(candidateText || "");
    var score = 0;

    for (var i = 0; i < targetTitles.length; i++) {
        var t = cleanTitle(targetTitles[i]);
        if (!t) continue;

        if (cleanUrlText.indexOf(t) !== -1 || cleanInnerText.indexOf(t) === 0) {
            score = Math.max(score, 100);
            continue;
        }

        var words = t.split(/\s+/).filter(function(w) { return w.length > 2; });
        var matches = 0;
        for (var j = 0; j < words.length; j++) {
            if (cleanUrlText.indexOf(words[j]) !== -1 || cleanInnerText.indexOf(words[j]) !== -1) {
                matches++;
            }
        }

        if (words.length > 0 && matches > 0) {
            var ratio = (matches / words.length) * 80;
            score = Math.max(score, ratio);
        }
    }

    if (score > 0 && targetYear) {
        if (cleanUrlText.indexOf(String(targetYear)) !== -1 || cleanInnerText.indexOf(String(targetYear)) !== -1) {
            score += 20;
        }
    }

    return score;
}

// ==========================================
// 3. DESEMPAQUETADOR Y DETECCIÓN DE CALIDAD (v2.3 intacto)
// ==========================================

function unpackJS(packed) {
    try {
        var regex = /eval\(function\(p,a,c,k,e,[r|d]\)\{[\s\S]*?\}\((['"][\s\S]+?['"]),\s*(\d+),\s*(\d+),\s*['"]([\s\S]+?)['"]\.split\('\|'\)/i;
        var match = packed.match(regex);
        if (!match) return null;

        var p = match[1].slice(1, -1);
        var a = match[2];
        var k = match[4];
        var words = k.split("|");
        var radix = parseInt(a, 10);

        var unbase = function(val, base) {
            var chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
            if (base <= 36) return parseInt(val, base);
            var res = 0;
            for (var i = 0; i < val.length; i++) res = res * base + chars.indexOf(val[i]);
            return res;
        };

        return p.replace(/\b[0-9a-zA-Z]+\b/g, function(token) {
            var idx = unbase(token, radix);
            return words[idx] !== undefined && words[idx] !== "" ? words[idx] : token;
        });
    } catch (e) {
        return null;
    }
}

function detectQualityFromUrl(url) {
    if (!url) return null;
    var clean = url.split("?")[0].toLowerCase();

    if (clean.indexOf(".urlset") !== -1) {
        var urlsetMatch = clean.match(/[_,]([a-z,]+)\.urlset/i);
        if (urlsetMatch) {
            var tags = urlsetMatch[1].split(",");
            if (tags.indexOf("x") !== -1 || tags.indexOf("o") !== -1 || tags.indexOf("fhd") !== -1) return "1080p";
            if (tags.indexOf("h") !== -1 || tags.indexOf("hd") !== -1) return "720p";
            if (tags.indexOf("n") !== -1 || tags.indexOf("sd") !== -1) return "480p";
            if (tags.indexOf("l") !== -1) return "360p";
        }
    }

    if (/(?:[-_./]|^)(?:4k|2160p?)(?:[-_./]|$)/i.test(clean)) return "4K";
    if (/(?:[-_./]|^)(?:1080p?|fhd)(?:[-_./]|$)/i.test(clean)) return "1080p";
    if (/(?:[-_./]|^)(?:720p?)(?:[-_./]|$)/i.test(clean)) return "720p";
    if (/(?:[-_./]|^)(?:480p?)(?:[-_./]|$)/i.test(clean)) return "480p";

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
        if (!res || !res.ok) return "720p";
        return textWithTimeout(res, 2500);
    })
    .then(function(text) {
        if (!text || text.indexOf("#EXT-X-STREAM-INF") === -1) {
            if (m3u8Url.indexOf("1080") !== -1) return "1080p";
            if (m3u8Url.indexOf("720") !== -1) return "720p";
            return "720p";
        }

        var maxH = 0;
        var resRegex = /RESOLUTION=\d+x(\d+)/gi;
        var match;
        while ((match = resRegex.exec(text)) !== null) {
            var h = parseInt(match[1], 10);
            if (h > maxH) maxH = h;
        }

        if (maxH >= 2160) return "4K";
        if (maxH >= 1080) return "1080p";
        if (maxH >= 720) return "720p";
        if (maxH >= 480) return "480p";
        return "720p";
    })
    .catch(function() {
        return "720p";
    });
}

// ==========================================
// 4. RESOLVER DE VIMEOS (STREAMING ONLINE) — v2.3 intacto
// ==========================================

function resolveVimeos(embedUrl) {
    if (!embedUrl) return Promise.resolve(null);
    var targetUrl = embedUrl;
    if (targetUrl.indexOf("http") !== 0) {
        targetUrl = "https://vimeos.net/embed-" + embedUrl + ".html";
    }

    return fetchWithTimeout(targetUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": "https://vimeos.net/" }
    }, 2800)
    .then(function(res) { return res ? textWithTimeout(res, 2800) : ""; })
    .then(function(html) {
        var streamUrl = null;
        var unpacked = unpackJS(html);
        if (unpacked) {
            var m3u8Match = unpacked.match(/["']([^"']+\.m3u8[^"']*)['"]/i) ||
                            unpacked.match(/(https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)/i);
            if (m3u8Match) streamUrl = m3u8Match[1].replace(/\\/g, "");
        }
        if (!streamUrl) {
            var direct = html.match(/(?:file|sources|src)\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i);
            if (direct) streamUrl = direct[1].replace(/\\/g, "");
        }

        if (streamUrl) {
            var hdrs = { "User-Agent": USER_AGENT, "Referer": "https://vimeos.net/" };
            return probeM3u8Quality(streamUrl, hdrs).then(function(q) {
                return {
                    url: streamUrl,
                    quality: q || "1080p",
                    server: "Vimeos",
                    headers: hdrs
                };
            });
        }
        return null;
    })
    .catch(function() { return null; });
}

// ==========================================
// 5. RESOLVER DE TORRENTS (P2P / MAGNETS) — v2.3 intacto
// ==========================================

function resolveTorrentMagnet(tItem, refererUrl) {
    return fetchWithTimeout(tItem.url, {
        headers: { "User-Agent": USER_AGENT, "Referer": refererUrl }
    }, 2500)
    .then(function(res) { return res ? textWithTimeout(res, 2500) : ""; })
    .then(function(html) {
        var magnetMatch = html.match(/magnet:\?xt=urn:btih:[a-zA-Z0-9]+[^"'\s<>]*/i);
        if (magnetMatch) {
            return {
                name: "CineCalidad",
                title: tItem.quality + " · " + tItem.label + " · P2P",
                quality: tItem.quality,
                url: magnetMatch[0],
                headers: {}
            };
        }
        return null;
    })
    .catch(function() { return null; });
}

// ==========================================
// 6. NAVEGACIÓN DE SERIES Y EXTRACCIÓN DE EMBEDS
// cinecalidad.am movió los episodios a /ver-el-episodio/{slug}-{s}x{e}/:
// la v2.3 construía {serie}-{s}x{e}/ sobre la URL de la serie y hoy responde 404.
// ==========================================

function scrapeEpisodeLink(pageHtml, s, e) {
    if (!pageHtml) return null;
    var epRegex = /href=["']([^"']*\/ver-el-episodio\/[^"']*)["']/gi;
    var exactSuffix = "-" + s + "x" + e + "/";
    var em;
    var loose = null;

    while ((em = epRegex.exec(pageHtml)) !== null) {
        var href = em[1].replace(/&amp;/g, "&");
        var numMatch = href.match(/-(\d+)x(\d+)(?:-\d+)?\/?$/);
        if (!numMatch) continue;
        if (parseInt(numMatch[1], 10) !== s || parseInt(numMatch[2], 10) !== e) continue;

        // Match exacto (sin sufijo de duplicado tipo -1x9-2/)
        if (href.length >= exactSuffix.length && href.slice(href.length - exactSuffix.length) === exactSuffix) {
            return href;
        }
        if (!loose) loose = href;
    }
    return loose;
}

function extractStreamsFromPage(pageHtml, refererUrl, allowTorrents) {
    if (!pageHtml) return Promise.resolve([]);

    // 1. Extraer streaming online (Vimeos)
    var onlinePromises = [];
    var lRegex = /https?:\/\/[a-zA-Z0-9.-]*vimeos\.[a-z]{2,6}\/[^\s"'<>]+/gi;
    var lm;
    var vimeosUrls = [];

    while ((lm = lRegex.exec(pageHtml)) !== null) {
        var clk = lm[0].replace(/\\/g, "").replace(/&amp;/g, "&");
        if (vimeosUrls.indexOf(clk) === -1) {
            vimeosUrls.push(clk);
            onlinePromises.push(
                resolveVimeos(clk).then(function(stream) {
                    if (stream && stream.url) {
                        logDiag("resolver vimeos -> OK " + stream.quality);
                        return {
                            name: "CineCalidad",
                            title: stream.quality + " · Latino · " + stream.server,
                            quality: stream.quality,
                            url: stream.url,
                            headers: stream.headers || {
                                "User-Agent": USER_AGENT,
                                "Referer": BASE_URL + "/"
                            }
                        };
                    }
                    logDiag("resolver vimeos -> SIN resultado");
                    return null;
                })
            );
        }
    }

    // 2. Extraer Torrents Duales (uTorrent) solo para películas
    var torrentPromises = [];
    if (allowTorrents) {
        var tRegex = /<a[^>]+href=["']([^"']*\?download=[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        var tm;
        var candidateTorrents = [];

        while ((tm = tRegex.exec(pageHtml)) !== null) {
            var tHref = tm[1];
            var tText = tm[2].replace(/<[^>]+>/g, "").trim();

            if (tText.toLowerCase().indexOf("utorrent") !== -1 || tText.toLowerCase().indexOf("torrent") !== -1) {
                var tQuality = "1080p";
                if (tText.indexOf("4K") !== -1 || tText.indexOf("2160") !== -1) tQuality = "4K";
                else if (tText.indexOf("1080") !== -1) tQuality = "1080p";
                else if (tText.indexOf("720") !== -1) tQuality = "720p";
                else if (tText.indexOf("DVD") !== -1 || tText.indexOf("480") !== -1) tQuality = "480p";

                var label = tText.replace(/uTorrent/i, "").trim() || "Dual";
                candidateTorrents.push({ url: tHref, label: label, quality: tQuality });
            }
        }

        // Tomar los mejores 2 torrents para mantener tiempo < 2.8s
        var topTorrents = candidateTorrents.slice(0, 2);
        for (var ti = 0; ti < topTorrents.length; ti++) {
            torrentPromises.push(resolveTorrentMagnet(topTorrents[ti], refererUrl));
        }
    }

    // Resolver streams online y torrents en paralelo
    return Promise.all(onlinePromises.concat(torrentPromises)).then(function(allResults) {
        var valid = [];
        var seen = [];
        for (var v = 0; v < allResults.length; v++) {
            if (allResults[v] && allResults[v].url && seen.indexOf(allResults[v].url) === -1) {
                seen.push(allResults[v].url);
                valid.push(allResults[v]);
            }
        }
        logDiag("total " + valid.length + " streams de " + onlinePromises.length + " embeds vimeos + " + torrentPromises.length + " torrents (" + Math.round(tvElapsed()) + "ms)");
        return valid;
    });
}

// ==========================================
// 7. FUNCIÓN PRINCIPAL DE NUVIO (getStreams)
// ==========================================

function getStreamsInner(tmdbId, mediaType, seasonNum, episodeNum) {
    var isTv = mediaType === "tv" || mediaType === "series";
    var s = parseInt(seasonNum || 1, 10);
    var e = parseInt(episodeNum || 1, 10);
    var tmdbUrl = "https://api.themoviedb.org/3/" + (isTv ? "tv" : "movie") + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=es-MX&append_to_response=alternative_titles";

    return fetchWithTimeout(tmdbUrl, {}, 2500)
        .then(function(res) {
            if (!res || !res.ok) throw new Error("TMDB Error");
            return jsonWithTimeout(res, 2500);
        })
        .then(function(meta) {
            if (!meta) throw new Error("TMDB JSON vacio");
            var title = isTv ? (meta.name || meta.original_name) : (meta.title || meta.original_title);
            var origTitle = isTv ? meta.original_name : meta.original_title;
            var year = ((isTv ? meta.first_air_date : meta.release_date) || "").substring(0, 4);

            logDiag("TMDB ok: '" + (title || "?") + "' (" + year + ") " + (isTv ? "S" + s + "E" + e : "movie") + " timer=" + HAS_TIMER);

            var titles = [];
            if (title) titles.push(title);
            if (origTitle && origTitle !== title) titles.push(origTitle);

            var altArr = (meta.alternative_titles && (meta.alternative_titles.results || meta.alternative_titles.titles)) || [];
            for (var i = 0; i < altArr.length; i++) {
                if (altArr[i].title && titles.indexOf(altArr[i].title) === -1) {
                    titles.push(altArr[i].title);
                }
            }

            var searchQuery = cleanTitle(title || origTitle);
            var searchUrl = BASE_URL + "/?s=" + encodeURIComponent(searchQuery);

            return fetchWithTimeout(searchUrl, { headers: DEFAULT_HEADERS }, 2800)
                .then(function(res) {
                    if (!res || !res.ok) return "";
                    return textWithTimeout(res, 2800);
                })
                .then(function(html) {
                    if (!html) {
                        logDiag("busqueda sin respuesta (" + Math.round(tvElapsed()) + "ms)");
                        return [];
                    }

                    var candidates = [];
                    var regex = /<a[^>]+href=["']([^"']*(?:ver-pelicula|ver-serie)\/[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
                    var m;

                    while ((m = regex.exec(html)) !== null) {
                        var href = m[1];
                        var innerText = m[2].replace(/<[^>]+>/g, "").trim();

                        if (candidates.map(function(c) { return c.url; }).indexOf(href) === -1) {
                            var sc = scoreCandidate(href, innerText, titles, year);
                            if (sc >= 35) {
                                candidates.push({ url: href, score: sc });
                            }
                        }
                    }

                    if (candidates.length === 0) {
                        logDiag("sin candidatos en la busqueda");
                        return [];
                    }

                    candidates.sort(function(a, b) { return b.score - a.score; });
                    var targetUrl = candidates[0].url;
                    logDiag("candidato: " + targetUrl + " (score " + candidates[0].score + ", " + candidates.length + " candidatos)");

                    if (targetUrl.indexOf("http") !== 0) {
                        targetUrl = BASE_URL + (targetUrl.indexOf("/") === 0 ? "" : "/") + targetUrl;
                    }

                    return fetchWithTimeout(targetUrl, { headers: DEFAULT_HEADERS }, 2800)
                        .then(function(r) { return r ? textWithTimeout(r, 2800) : ""; })
                        .then(function(pageHtml) {
                            if (!pageHtml) return [];

                            if (isTv) {
                                // cinecalidad.am movió los episodios a /ver-el-episodio/{slug}-{s}x{e}/:
                                // extraer el enlace desde la página de la serie y resolver ahí.
                                var epUrl = scrapeEpisodeLink(pageHtml, s, e);
                                if (epUrl) {
                                    logDiag("episodio: " + epUrl);
                                    return fetchWithTimeout(epUrl, { headers: DEFAULT_HEADERS }, 2800)
                                        .then(function(r2) { return r2 ? textWithTimeout(r2, 2800) : ""; })
                                        .then(function(epHtml) {
                                            return extractStreamsFromPage(epHtml || pageHtml, targetUrl, false);
                                        });
                                }
                                logDiag("sin enlace de episodio en la página de serie; extrayendo embeds de la página de serie");
                                return extractStreamsFromPage(pageHtml, targetUrl, false);
                            }

                            return extractStreamsFromPage(pageHtml, targetUrl, true);
                        });
                });
        })
        .catch(function(eStage) {
            logDiag("fallo de etapa: " + (eStage && eStage.message ? eStage.message : eStage));
            return [];
        });
}

// Contrato: getStreams SIEMPRE devuelve una Promesa que resuelve a un Array.
function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    try {
        START_TS = tvNow();
        logDiag("getStreams tmdbId=" + tmdbId + " type=" + mediaType + " s=" + seasonNum + " e=" + episodeNum);
        if (!tmdbId) return Promise.resolve([]);
        return getStreamsInner(tmdbId, mediaType, seasonNum, episodeNum);
    } catch (eSync) {
        return Promise.resolve([]);
    }
}

if (typeof module !== "undefined") {
    module.exports = { getStreams: getStreams };
}
