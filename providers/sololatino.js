/**
 * Provider: SoloLatino (Películas y Series en Latino, Castellano y Sub)
 * Dominio: https://sololatino.net (Catálogo 100% Nativo de SoloLatino)
 * Motor: 100% Cadenas de Promesas (Hermes / QuickJS / NuvioTV Firestick Safe)
 * Versión Fusionada y Blindada: Handshake anti-WAF, timeouts en body, tolerancia regional de año.
 */

var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var BASE_URL = "https://sololatino.net";
var PLAYER_HOST = "https://player.pelisserieshoy.com";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var NETWORK_TIMEOUT = 2500;
var GLOBAL_DEADLINE_MS = 9000;
var PROBE_HLS_QUALITY = true;
var HLS_PROBE_TIMEOUT = 1300;
var MAX_HLS_PROBES = 2;

var DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-MX,es;q=0.9,en;q=0.8",
    "Referer": BASE_URL + "/"
};

// ==========================================
// 1. HELPERS DE RED & FORM (HERMES / TV SAFE)
// ==========================================

function fetchWithTimeout(url, options, timeoutMs) {
    var limit = timeoutMs || NETWORK_TIMEOUT;
    return new Promise(function(resolve, reject) {
        var timer = setTimeout(function() {
            reject(new Error("Timeout tras " + limit + "ms: " + url));
        }, limit);

        fetch(url, options || {})
            .then(function(res) {
                clearTimeout(timer);
                resolve(res);
            })
            .catch(function(err) {
                clearTimeout(timer);
                reject(err);
            });
    });
}

function bodyWithTimeout(res, method, timeoutMs) {
    var limit = timeoutMs || NETWORK_TIMEOUT;
    return new Promise(function(resolve, reject) {
        var timer = setTimeout(function() {
            reject(new Error("Body timeout tras " + limit + "ms"));
        }, limit);
        try {
            res[method]().then(function(data) {
                clearTimeout(timer);
                resolve(data);
            }).catch(function(err) {
                clearTimeout(timer);
                reject(err);
            });
        } catch (e) {
            clearTimeout(timer);
            reject(e);
        }
    });
}

function textWithTimeout(res, timeoutMs) {
    return bodyWithTimeout(res, "text", timeoutMs);
}

function jsonWithTimeout(res, timeoutMs) {
    return bodyWithTimeout(res, "json", timeoutMs);
}

function isResOk(res) {
    return !!res && (res.ok === true || (typeof res.status === "number" && res.status >= 200 && res.status < 300));
}

function ctxTimeLeft(ctx) {
    if (!ctx || !ctx.deadline) return 60000;
    return ctx.deadline - Date.now();
}

function ctxExpired(ctx) {
    return !!(ctx && ctx.deadline && Date.now() >= ctx.deadline);
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

function toAbsolute(href, base) {
    if (!href) return "";
    var h = String(href).replace(/^\s+|\s+$/g, "");
    if (h.indexOf("https://") === 0 || h.indexOf("http://") === 0) return h;
    if (h.indexOf("//") === 0) return "https:" + h;
    if (h.indexOf("/") === 0) return base + h;
    return base + "/" + h;
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

    // Regla 6: Bonificar año exacto. Tolerancia de ±1 año para estrenos LATAM vs EE. UU.
    // Solo penaliza (-25) si el año difiere en más de 1 año (protege secuelas/remakes).
    if (score > 0 && year) {
        var targetYear = parseInt(year, 10);
        if (slugWords.indexOf(String(year)) !== -1) {
            score += 20;
        } else {
            for (var y = 0; y < slugWords.length; y++) {
                var wY = slugWords[y];
                if (/^(19|20)\d{2}$/.test(wY)) {
                    var foundY = parseInt(wY, 10);
                    if (Math.abs(foundY - targetYear) > 1) {
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
                    }
                    break;
                }
            }
        }
    }

    return score;
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

function classifyResolution(w, h) {
    if (w >= 3800 || h >= 2100) return "4K";
    if (w >= 1800 || h >= 1000) return "1080p";
    if (w >= 1200 || h >= 690) return "720p";
    if (w >= 800 || h >= 420) return "480p";
    return "Auto";
}

function probeHlsQuality(url, referer) {
    return fetchWithTimeout(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": referer }
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
// 2. EXTRACCIÓN DE FICHA Y PLAYER LARAVEL
// ==========================================

function fetchDirectPage(urls, ctx) {
    if (!urls || urls.length === 0) return Promise.resolve(null);

    function tryNext(idx) {
        if (idx >= urls.length || ctxExpired(ctx)) return Promise.resolve(null);
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
        if (idx >= queries.length || ctxExpired(ctx)) return Promise.resolve(null);
        var searchUrl = BASE_URL + "/buscar?q=" + encodeURIComponent(queries[idx]);

        return fetchWithTimeout(searchUrl, { headers: DEFAULT_HEADERS }, NETWORK_TIMEOUT)
            .then(function(res) { return isResOk(res) ? textWithTimeout(res) : ""; })
            .then(function(html) {
                if (!html) return tryQuery(idx + 1);

                var prefix = isMovie ? "/pelicula/" : "/serie/";
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
    if (ctxExpired(ctx)) return Promise.resolve([]);

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

        var tMatch = html.match(/const\s+_t\s*=\s*'([^']+)'/);
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

        function fallbackQuality(isMp4, rawU, cleanLabel) {
            if (isMp4) return "720p";
            if (rawU.indexOf("master.m3u8") !== -1) return "1080p";
            return detectQuality(rawU, cleanLabel);
        }

        // PASO 1: Listar opciones disponibles
        return postS({ a: "1" }).then(function(scan) {
            if (!scan) return [];

            var items = [];
            var langsMap = scan.langs_s || {};
            var langOrder = ["LAT", "SUB", "ESP"];

            for (var l = 0; l < langOrder.length; l++) {
                var langCode = langOrder[l];
                var arr = langsMap[langCode];
                if (Array.isArray(arr)) {
                    var limit = langCode === "LAT" ? 2 : 1;
                    for (var i = 0; i < Math.min(limit, arr.length); i++) {
                        if (arr[i] && arr[i][1]) {
                            items.push({ lang: langCode, label: arr[i][0] || "Stream", id: arr[i][1] });
                        }
                    }
                }
            }

            if (items.length === 0 && Array.isArray(scan.s)) {
                for (var s = 0; s < Math.min(3, scan.s.length); s++) {
                    if (scan.s[s] && scan.s[s][1]) {
                        items.push({ lang: "LAT", label: scan.s[s][0] || "Stream", id: scan.s[s][1] });
                    }
                }
            }

            if (items.length === 0) return [];
            if (ctxExpired(ctx)) return [];

            // PASO 2: Autorizar sesión con a=click
            return postS({ a: "click", ts: "1" }).then(function() {
                // PASO 3: Resolver SECUENCIALMENTE para que el WAF no devuelva 403
                var results = [];
                var seenKeys = [];
                var seenUrls = [];

                function resolveNext(idx) {
                    if (idx >= items.length || ctxExpired(ctx)) return Promise.resolve(results);
                    var item = items[idx];

                    return postS({ a: "2", v: item.id, src: scan.src || "" })
                        .then(function(d) {
                            if (d && d.u) {
                                var rawU = String(d.u);
                                var finalUrl = null;
                                var isMp4 = d.type === "mp4" || rawU.indexOf("/p.php?v=") !== -1;

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

                                if (finalUrl && seenKeys.indexOf(rawU) === -1 && seenUrls.indexOf(finalUrl) === -1) {
                                    var cleanLabel = item.label.replace(/[^\w\s+áéíóúñÁÉÍÓÚÑ.-]/g, "").trim() || "Servidor";

                                    var canProbe = PROBE_HLS_QUALITY && !isMp4 &&
                                        finalUrl.indexOf(".m3u8") !== -1 &&
                                        ctx && typeof ctx.probes === "number" &&
                                        ctx.probes < MAX_HLS_PROBES &&
                                        ctxTimeLeft(ctx) > 2100;

                                    var pushWithQuality = function(qual) {
                                        seenKeys.push(rawU);
                                        seenUrls.push(finalUrl);
                                        results.push({
                                            name: "SoloLatino",
                                            title: qual + " · " + item.lang + " · " + cleanLabel + (isMp4 ? " (MP4)" : ""),
                                            quality: qual,
                                            url: finalUrl,
                                            headers: { "User-Agent": USER_AGENT, "Referer": playerUrl }
                                        });
                                        return resolveNext(idx + 1);
                                    };

                                    if (canProbe) {
                                        ctx.probes++;
                                        return probeHlsQuality(finalUrl, playerUrl).then(function(detected) {
                                            return pushWithQuality(detected || fallbackQuality(isMp4, rawU, cleanLabel));
                                        });
                                    }

                                    return pushWithQuality(fallbackQuality(isMp4, rawU, cleanLabel));
                                }
                            }
                            return resolveNext(idx + 1);
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
// 3. FUNCIÓN PRINCIPAL EXPORTADA (getStreams)
// ==========================================

function getStreams(tmdbId, mediaType, season, episode) {
    var isMovie = mediaType === "movie";

    var tmdbIdStr = String(tmdbId === undefined || tmdbId === null ? "" : tmdbId).replace(/[^0-9]/g, "");
    if (!tmdbIdStr) return Promise.resolve([]);

    var sParsed = parseInt(season, 10);
    var sNum = isNaN(sParsed) ? 1 : sParsed;
    var eParsed = parseInt(episode, 10);
    var eNum = isNaN(eParsed) ? 1 : eParsed;
    var epPadded = padZero(eNum);

    var ctx = { deadline: Date.now() + GLOBAL_DEADLINE_MS, probes: 0 };

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
            var year = ((isMovie ? meta.release_date : meta.first_air_date) || "").slice(0, 4);

            var titles = [];
            if (title) titles.push(title);
            if (origTitle && titles.indexOf(origTitle) === -1) titles.push(origTitle);

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

                    if (cleanBase.indexOf("/temporada-") !== -1 && cleanBase.indexOf("/episodio-") !== -1) {
                        return fetchDirectPage([cleanBase], ctx);
                    }

                    return fetchDirectPage([
                        cleanBase + "/temporada-" + sNum + "/episodio-" + eNum,
                        cleanBase + "/temporada-" + sNum + "/episodio-" + epPadded
                    ], ctx);
                });
            });
        })
        .then(function(pageObj) {
            if (!pageObj) return [];
            if (ctxExpired(ctx)) return [];

            var tokenInfo = extractPlayerTokens(pageObj.html);
            if (!tokenInfo) return [];

            function tryToken(tIdx) {
                if (tIdx >= Math.min(2, tokenInfo.tokens.length) || ctxExpired(ctx)) return Promise.resolve(null);
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

if (typeof module !== "undefined" && module.exports) {
    module.exports = { getStreams: getStreams };
}
