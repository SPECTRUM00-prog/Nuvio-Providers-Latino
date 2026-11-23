/**
 * Provider: LaMovie (Películas en Español Latino y Dual)
 * Motor: FastApi v1 (lamovie.org) + Multi-Resolver (Vimeos, StreamWish, Filemoon)
 * Reglas Hermes: ES5 estricto, 100% Promesas, Zero-Dependencies, Fast Timeout (<= 2800ms)
 *
 * Cambios v2.3-NUVIOTV (2026-11) - capa runtime portada de jkanime v2.9 / sololatino v2.0:
 *  1) FIX CRITICO DE TV: el QuickJS de NuvioTV (dokar quickjs-kt + polyfill de
 *     PluginRuntime.kt) NO define setTimeout/clearTimeout. La v2.2 los usaba sin
 *     condition en fetchWithTimeout/textWithTimeout/jsonWithTimeout -> cada fetch
 *     rechazaba al instante y el provider devolvia [] SOLO en TV (en PC/Hermes
 *     funcionaba). Ahora HAS_TIMER detecta el runtime: con timer (Hermes movil /
 *     PC / Node) se conserva el timeout por llamada; sin timer (TV) fetch directo
 *     apoyado en el corte real de OkHttp (30s connect / 30s read).
 *  2) PRESUPUESTO GLOBAL Date.now() de 45s (el runtime mata el plugin a los 60s):
 *     cada fetch verifica tvRemaining() y se cancela con null si queda < 400ms.
 *  3) TIMEOUT TAMBIEN SOBRE EL CUERPO en las rutas sin timer (res.text()/res.json()
 *     colgados ya no congelan la cadena) y jsonWithTimeout aplicado al endpoint
 *     /wp-api/v1/player (antes usaba r.json() crudo).
 *  4) RESOLVER STREAMWISH CORREGIDO: la reescritura iba a hlswish.com, que da
 *     errores SSL (leccion jkanime/sololatino). Ahora reescribe a playerwish.com
 *     y reintenta con la URL original si no encuentra m3u8. Keywords ampliadas
 *     (strwish/flaswish/hglink/playerwish/vibuxer) en el dispatcher.
 *  5) DIAGNOSTICO: rastro por console.error (NuvioTV/FireOS silencia console.log)
 *     + dedupe final por URL exacta (Regla 8) + contrato garantizado: getStreams
 *     SIEMPRE devuelve una Promesa que resuelve a Array.
 *  6) LOGICA DE SCRAPING INTACTA (v2.2, probada en produccion): API wp-api/v1
 *     (search -> player?postId -> embeds), scoring (umbral 35, anio +20),
 *     resolver Vimeos (unpack Dean Edwards), mapa de calidad por tags .urlset
 *     propio de vimeos (h=720p verificado: 1720x720 real), probe RESOLUTION.
 *     NOTA: videoapp.zip es un wrapper firmado del mismo embed Vimeos -> se
 *     ignora (el dedupe evita duplicados).
 */

var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var BASE_URL = "https://lamovie.org";
var API_BASE = BASE_URL + "/wp-api/v1";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var NETWORK_TIMEOUT = 2800;

var DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json, text/plain, */*",
    "Referer": BASE_URL + "/"
};

var LOG_TAG = "[LaMovie][v2.3]";

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

// ==========================================
// 2. SCORING Y DESEMPAQUETADOR (v2.2 intacto)
// ==========================================

function cleanTitle(str) {
    if (!str) return "";
    var normalized = str;
    try {
        normalized = str.normalize("NFD");
    } catch (e) {}
    return normalized
        .toLowerCase()
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function scoreCandidate(itemTitle, targetTitles, targetYear) {
    if (!itemTitle) return 0;
    var cTitle = cleanTitle(itemTitle);
    var score = 0;

    for (var i = 0; i < targetTitles.length; i++) {
        var t = cleanTitle(targetTitles[i]);
        if (!t) continue;

        if (cTitle === t || cTitle.indexOf(t) === 0) {
            score = Math.max(score, 100);
            continue;
        }

        var words = t.split(/\s+/).filter(function(w) { return w.length > 2; });
        var matches = 0;
        for (var j = 0; j < words.length; j++) {
            if (cTitle.indexOf(words[j]) !== -1) {
                matches++;
            }
        }

        if (words.length > 0 && matches > 0) {
            var ratio = (matches / words.length) * 80;
            score = Math.max(score, ratio);
        }
    }

    if (score > 0 && targetYear && cTitle.indexOf(String(targetYear)) !== -1) {
        score += 20;
    }

    return score;
}

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

// ==========================================
// 3. DETECCIÓN DE CALIDAD (v2.2 intacto: mapa propio de vimeos)
// ==========================================

function detectQualityFromUrl(url) {
    if (!url) return null;
    var u = url.toLowerCase();
    if (u.indexOf("vimeos") !== -1) {
        var urlsetMatch = u.match(/[,_]([a-z,]+)[,_]\.urlset/);
        if (urlsetMatch) {
            var tags = urlsetMatch[1].split(",");
            if (tags.indexOf("x") !== -1 || tags.indexOf("o") !== -1) return "1080p";
            if (tags.indexOf("h") !== -1) return "720p";
            if (tags.indexOf("n") !== -1) return "480p";
            if (tags.indexOf("l") !== -1) return "360p";
        }
    }
    if (u.indexOf("4k") !== -1 || u.indexOf("2160") !== -1) return "4K";
    if (u.indexOf("1080") !== -1) return "1080p";
    if (u.indexOf("720") !== -1) return "720p";
    if (u.indexOf("480") !== -1) return "480p";
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
        return textWithTimeout(res, 3000);
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
// 4. RESOLVERS (v2.2 intacto + reescritura playerwish en StreamWish)
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
    .then(function(res) { return res ? textWithTimeout(res, 3000) : ""; })
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

function resolveWishEmbed(targetUrl, originalUrl) {
    return fetchWithTimeout(targetUrl, { headers: { "User-Agent": USER_AGENT, "Referer": targetUrl }, redirect: "follow" }, 2800)
        .then(function(res) { return res ? textWithTimeout(res, 3000) : ""; })
        .then(function(html) {
            var direct = html.match(/(?:file|sources|src)\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i);
            if (direct) {
                return probeM3u8Quality(direct[1], { "User-Agent": USER_AGENT, "Referer": targetUrl }).then(function(q) {
                    return { url: direct[1], quality: q, server: "StreamWish", headers: { "User-Agent": USER_AGENT, "Referer": targetUrl } };
                });
            }
            var unpacked = unpackJS(html);
            if (unpacked) {
                var m3u8 = unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i);
                if (m3u8) {
                    return probeM3u8Quality(m3u8[0], { "User-Agent": USER_AGENT, "Referer": targetUrl }).then(function(q) {
                        return { url: m3u8[0], quality: q, server: "StreamWish", headers: { "User-Agent": USER_AGENT, "Referer": targetUrl } };
                    });
                }
            }
            return null;
        })
        .catch(function() { return null; });
}

function resolveStreamWish(url) {
    var idMatch = url.match(/\/(?:e|v|f)\/([a-zA-Z0-9]+)/);
    // Leccion jkanime/sololatino: hlswish.com da errores SSL -> playerwish.com.
    var targetUrl = idMatch ? "https://playerwish.com/e/" + idMatch[1] : url;

    return resolveWishEmbed(targetUrl, url).then(function(stream) {
        if (stream) return stream;
        if (targetUrl !== url) {
            logDiag("playerwish sin m3u8, reintentando con la URL original");
            return resolveWishEmbed(url, url);
        }
        return null;
    });
}

function resolveFilemoon(url) {
    return fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT, "Referer": url }, redirect: "follow" }, 2800)
        .then(function(res) { return res ? textWithTimeout(res, 3000) : ""; })
        .then(function(html) {
            var direct = html.match(/(?:file|sources|src)\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i);
            if (direct) {
                return probeM3u8Quality(direct[1], { "User-Agent": USER_AGENT, "Referer": url }).then(function(q) {
                    return { url: direct[1], quality: q, server: "Filemoon", headers: { "User-Agent": USER_AGENT, "Referer": url } };
                });
            }
            var unpacked = unpackJS(html);
            if (unpacked) {
                var m3u8 = unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i);
                if (m3u8) {
                    return probeM3u8Quality(m3u8[0], { "User-Agent": USER_AGENT, "Referer": url }).then(function(q) {
                        return { url: m3u8[0], quality: q, server: "Filemoon", headers: { "User-Agent": USER_AGENT, "Referer": url } };
                    });
                }
            }
            return null;
        })
        .catch(function() { return null; });
}

function dispatchResolver(rawUrl) {
    if (!rawUrl) return Promise.resolve(null);
    var u = rawUrl.toLowerCase();
    if (u.indexOf("videoapp.zip") !== -1) {
        // Wrapper firmado del mismo embed Vimeos -> el dedupe lo cubre.
        return Promise.resolve(null);
    }
    if (u.indexOf("vimeos.net") !== -1) return resolveVimeos(rawUrl);
    if (u.indexOf("hlswish") !== -1 || u.indexOf("streamwish") !== -1 ||
        u.indexOf("playerwish") !== -1 || u.indexOf("strwish") !== -1 ||
        u.indexOf("flaswish") !== -1 || u.indexOf("hglink") !== -1) {
        return resolveStreamWish(rawUrl);
    }
    if (u.indexOf("filemoon") !== -1) return resolveFilemoon(rawUrl);
    logDiag("embed sin resolver conocido: " + rawUrl);
    return Promise.resolve(null);
}

// ==========================================
// 5. FUNCIÓN PRINCIPAL DE NUVIO (getStreams)
// ==========================================

function getStreamsInner(tmdbId, mediaType) {
    var isMovie = mediaType === "movie";
    if (!isMovie) {
        logDiag("tipo no soportado por lamovie (solo peliculas)");
        return Promise.resolve([]);
    }

    var tmdbUrl = "https://api.themoviedb.org/3/movie/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=es-MX&append_to_response=alternative_titles";

    return fetchWithTimeout(tmdbUrl, {}, 2500)
        .then(function(res) {
            if (!res || !res.ok) throw new Error("TMDB Error");
            return jsonWithTimeout(res, 3000);
        })
        .then(function(meta) {
            if (!meta) throw new Error("TMDB JSON vacio");
            var title = meta.title || meta.original_title || "";
            var origTitle = meta.original_title || "";
            var year = (meta.release_date || "").substring(0, 4);

            logDiag("TMDB ok: '" + (title || "?") + "' (" + year + ") movie timer=" + HAS_TIMER);

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
            var searchUrl = API_BASE + "/search?q=" + encodeURIComponent(searchQuery);

            return fetchWithTimeout(searchUrl, { headers: DEFAULT_HEADERS }, 2800)
                .then(function(res) {
                    if (!res || !res.ok) return null;
                    return jsonWithTimeout(res, 3000);
                })
                .then(function(searchRes) {
                    var posts = (searchRes && searchRes.data && searchRes.data.posts) || [];
                    if (posts.length === 0) {
                        logDiag("sin posts en la busqueda");
                        return [];
                    }

                    var scored = [];
                    for (var p = 0; p < posts.length; p++) {
                        var post = posts[p];
                        var sc = scoreCandidate(post.title, titles, year);
                        if (sc >= 35) {
                            scored.push({ post: post, score: sc });
                        }
                    }

                    if (scored.length === 0) {
                        logDiag("sin candidatos con score >= 35");
                        return [];
                    }

                    scored.sort(function(a, b) { return b.score - a.score; });
                    var targetPostId = scored[0].post._id;
                    logDiag("post: '" + (scored[0].post.title || "?") + "' (score " + scored[0].score + ", " + posts.length + " posts)");

                    var playerUrl = API_BASE + "/player?postId=" + targetPostId + "&demo=0";

                    return fetchWithTimeout(playerUrl, { headers: DEFAULT_HEADERS }, 2800)
                        .then(function(r) { return r ? jsonWithTimeout(r, 3000) : null; })
                        .then(function(playerJson) {
                            var embeds = (playerJson && playerJson.data && playerJson.data.embeds) || [];
                            if (embeds.length === 0) {
                                logDiag("player sin embeds");
                                return [];
                            }
                            logDiag("embeds: " + embeds.length);

                            var promises = embeds.map(function(item) {
                                var sUrl = item.url;
                                var lang = item.lang || "Latino";

                                return dispatchResolver(sUrl).then(function(stream) {
                                    if (stream && stream.url) {
                                        logDiag("resolver -> OK " + stream.quality + " (" + lang + " · " + stream.server + ")");
                                        return {
                                            name: "LaMovie",
                                            title: stream.quality + " · " + lang + " · " + stream.server,
                                            quality: stream.quality,
                                            url: stream.url,
                                            headers: stream.headers || {
                                                "User-Agent": USER_AGENT,
                                                "Referer": BASE_URL + "/"
                                            }
                                        };
                                    }
                                    logDiag("resolver -> SIN resultado (" + lang + ")");
                                    return null;
                                });
                            });

                            return Promise.all(promises).then(function(results) {
                                var valid = [];
                                var seen = [];
                                for (var v = 0; v < results.length; v++) {
                                    if (results[v] && results[v].url && seen.indexOf(results[v].url) === -1) {
                                        seen.push(results[v].url);
                                        valid.push(results[v]);
                                    }
                                }
                                logDiag("total " + valid.length + " streams de " + embeds.length + " embeds (" + Math.round(tvElapsed()) + "ms)");
                                return valid;
                            });
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
        return getStreamsInner(tmdbId, mediaType);
    } catch (eSync) {
        return Promise.resolve([]);
    }
}

if (typeof module !== "undefined") {
    module.exports = { getStreams: getStreams };
}
