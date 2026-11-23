#!/usr/bin/env node
// =====================================================================
// Diagnostico Cloudflare para pelisgo.online (complementa pelisgo.js v1.2)
// Uso en tu PC:   node test_cf_pelisgo.js [slug]
// Ejemplo:        node test_cf_pelisgo.js matrix
// Requiere Node 18+ (global fetch). Cero dependencias.
// =====================================================================
var fs = require("fs");
var slug = (process.argv[2] || "matrix").replace(/[^a-z0-9-]/gi, "");
var BASE = "https://pelisgo.online";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

if (typeof fetch !== "function") {
    console.log("ERROR: este script necesita Node 18 o superior (fetch global).");
    process.exit(1);
}

var COOKIE_JAR = [];

function browserHeaders(referer) {
    var h = {
        "User-Agent": UA,
        "Accept": "*/*",
        "Accept-Language": "es-MX,es;q=0.9",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        "sec-ch-ua": "\"Chromium\";v=\"122\", \"Google Chrome\";v=\"122\", \"Not:A-Brand\";v=\"99\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\""
    };
    if (referer) h["Referer"] = referer;
    if (COOKIE_JAR.length) h["Cookie"] = COOKIE_JAR.join("; ");
    return h;
}

function pageHeaders(referer) {
    return {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-MX,es;q=0.9",
        "Referer": referer || BASE + "/"
    };
}

function grabCookies(res) {
    try {
        var arr = [];
        if (typeof res.headers.getSetCookie === "function") {
            arr = res.headers.getSetCookie();
        } else {
            var raw = res.headers.get("set-cookie");
            if (raw) arr = [raw];
        }
        for (var i = 0; i < arr.length; i++) {
            var nv = String(arr[i] || "").split(";")[0].trim();
            if (nv && nv.indexOf("=") !== -1 && COOKIE_JAR.indexOf(nv) === -1) {
                COOKIE_JAR.push(nv);
                console.log("   cookie <- " + nv.split("=")[0] + "=...");
            }
        }
    } catch (e) {}
}

function cfSummary(res) {
    var h = res.headers;
    var out = [];
    var keys = ["cf-ray", "cf-mitigated", "cf-cache-status", "server"];
    for (var i = 0; i < keys.length; i++) {
        var v = null;
        try { v = h.get(keys[i]); } catch (e) {}
        if (v) out.push(keys[i] + "=" + v);
    }
    return out.length ? out.join("  ") : "(sin cabeceras CF)";
}

function challengeIn(body) {
    if (!body) return false;
    return body.indexOf("Just a moment") !== -1 ||
        body.indexOf("Performing security verification") !== -1 ||
        body.indexOf("Attention Required") !== -1 ||
        body.indexOf("cf-chl") !== -1;
}

function head(body, n) {
    if (!body) return "(vacio)";
    var t = String(body).replace(/\s+/g, " ").trim();
    return t.slice(0, n || 200);
}

function step(msg) { console.log("\n--------------------------------------------------"); console.log(msg); }

var pageUrl = BASE + "/movies/" + slug;
var movieIdNew = "";
var movieIdOld = "";
var pageHtml = "";

step("[1/4] GET " + BASE + "/  (baseline, cabeceras de pagina)")
fetch(BASE + "/", { headers: pageHeaders() })
    .then(function(res) {
        console.log("   status: " + res.status + "  " + cfSummary(res));
        grabCookies(res);
        return res.text();
    })
    .then(function(body) {
        console.log("   body: " + head(body, 160));
        if (challengeIn(body)) console.log("   >>> CHALLENGE DE CLOUDFLARE EN LA HOME");
    })

    .then(function() {
        step("[2/4] GET " + BASE + "/search?q=" + slug);
        return fetch(BASE + "/search?q=" + encodeURIComponent(slug), { headers: pageHeaders() });
    })
    .then(function(res) {
        console.log("   status: " + res.status + "  " + cfSummary(res));
        grabCookies(res);
        return res.text();
    })
    .then(function(body) {
        var re = /href=["'](\/movies\/[^"'\s<>]+)["']/gi, m, n = 0, first = "";
        while ((m = re.exec(body)) !== null && n < 5) {
            if (!first) first = m[1];
            n++;
        }
        console.log("   enlaces /movies/ encontrados: " + n + (first ? "  (1o: " + first + ")" : ""));
        if (challengeIn(body)) console.log("   >>> CHALLENGE EN /search");
    })

    .then(function() {
        step("[3/4] GET " + pageUrl + "  (paginas = ruta principal v1.2)");
        return fetch(pageUrl, { headers: pageHeaders(BASE + "/") });
    })
    .then(function(res) {
        console.log("   status: " + res.status + "  " + cfSummary(res));
        grabCookies(res);
        return res.text();
    })
    .then(function(html) {
        pageHtml = html || "";
        try { fs.writeFileSync("pelisgo_" + slug + ".html", pageHtml); } catch (e) {}
        console.log("   bytes: " + pageHtml.length + (fs.existsSync("pelisgo_" + slug + ".html") ? "  (guardado en pelisgo_" + slug + ".html)" : ""));

        var markers = ["__NEXT_DATA__", "self.__next_f", "\"links\"", "goodstream", "filemoon", "streamwish", "vidhide", ".m3u8", ".mp4", "movieId"];
        console.log("   marcadores en el HTML:");
        for (var i = 0; i < markers.length; i++) {
            var idx = pageHtml.indexOf(markers[i]);
            console.log("     " + (idx !== -1 ? "[X]" : "[ ]") + " " + markers[i] + (idx !== -1 ? "  (pos " + idx + ")" : ""));
        }

        // movieId con el regex CORRECTO v1.2 y con el VIEJO (que truncaba en "s")
        var mNew = pageHtml.match(/\\?"movieId\\?"\s*:\s*\\?"([^"\\]+)\\?"/i);
        var mOld = pageHtml.match(/\\?"movieId\\?"\s*:\s*\\?"([^"\\s]+)\\?"/i);
        movieIdNew = mNew ? mNew[1] : "";
        movieIdOld = mOld ? mOld[1] : "";
        console.log("   movieId regex v1.2 (correcto): " + (movieIdNew || "(no encontrado)"));
        if (movieIdOld !== movieIdNew) {
            console.log("   movieId regex v1.1 (truncado en 's'): " + movieIdOld + "   <<< CONFIRMADO el bug de truncado");
        }
        var idPos = pageHtml.indexOf("movieId");
        if (idPos !== -1) {
            console.log("   contexto movieId: ..." + pageHtml.slice(Math.max(0, idPos - 60), idPos + 140).replace(/\s+/g, " ") + "...");
        }
        var embPos = -1;
        var embKeys = ["goodstream", "filemoon", ".m3u8", ".mp4"];
        for (var k = 0; k < embKeys.length && embPos === -1; k++) embPos = pageHtml.indexOf(embKeys[k]);
        if (embPos !== -1) {
            console.log("   primer embed: ..." + pageHtml.slice(Math.max(0, embPos - 80), embPos + 160).replace(/\s+/g, " ") + "...");
        }
        if (challengeIn(pageHtml)) console.log("   >>> CHALLENGE EN LA PAGINA (v1.2 no tendra ruta principal)");
    })

    .then(function() {
        if (!movieIdNew) {
            console.log("\n[4/4] Sin movieId -> se omiten las variantes de la API");
            return;
        }
        step("[4/4] API /api/movies/" + movieIdNew + "/stream con 3 variantes de cabeceras");
        var apiUrl = BASE + "/api/movies/" + movieIdNew + "/stream";

        var variants = [
            { name: "V1 (cabeceras v1.1: UA + Accept json + Referer)", h: { "User-Agent": UA, "Accept": "application/json", "Referer": pageUrl } },
            { name: "V2 (navegador real: sec-fetch + sec-ch-ua + idioma)", h: browserHeaders(pageUrl) },
            { name: "V3 (V2 + cookies de las respuestas anteriores)", h: browserHeaders(pageUrl) } // jar ya incluido
        ];

        var chain = Promise.resolve();
        for (var v = 0; v < variants.length; v++) {
            (function(variant) {
                chain = chain.then(function() {
                    console.log("   -- " + variant.name);
                    return fetch(apiUrl, { headers: variant.h }).then(function(res) {
                        console.log("      status: " + res.status + "  " + cfSummary(res));
                        grabCookies(res);
                        return res.text();
                    }).then(function(body) {
                        if (challengeIn(body)) {
                            console.log("      body: CHALLENGE DE CLOUDFLARE (" + head(body, 100) + ")");
                        } else {
                            console.log("      body: " + head(body, 220));
                        }
                    }).catch(function(e) {
                        console.log("      error: " + (e && e.message ? e.message : e));
                    });
                });
            })(variants[v]);
        }
        return chain;
    })

    .then(function() {
        step("RESUMEN (pega esto en el chat)");
        var summary = {
            slug: slug,
            jar: COOKIE_JAR.map(function(c) { return c.split("=")[0]; }),
            pageBytes: pageHtml.length,
            movieIdNew: movieIdNew,
            movieIdOld: movieIdOld,
            pageHasLinksJson: pageHtml.indexOf("\"links\"") !== -1,
            pageHasEmbeds: pageHtml.indexOf("goodstream") !== -1 || pageHtml.indexOf("filemoon") !== -1 || pageHtml.indexOf(".m3u8") !== -1,
            htmlFile: "pelisgo_" + slug + ".html"
        };
        console.log(JSON.stringify(summary));
        console.log("");
        console.log("Interpretacion:");
        console.log(" - Si la pagina trae links/embeds -> v1.2 resuelve SIN tocar la API (ruta principal).");
        console.log(" - Si alguna variante V2/V3 de la API devuelve 200/JSON -> se ajustan cabeceras y tambien funcionara el fallback.");
        console.log(" - Si todo devuelve challenge -> la API es inalcanzable sin navegador; v1.2 dependera de lo que traiga la pagina.");
        console.log(" - Si quieres afinar la extraccion, comparte pelisgo_" + slug + ".html (o su primera mitad).");
    })
    .catch(function(e) {
        console.log("\nERROR global: " + (e && e.message ? e.message : e));
        process.exit(1);
    });
