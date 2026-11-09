/**
 * Laboratorio de ingeniería inversa para StreamWish (JKAnime & SoloLatino)
 * Ejecución: node providers/inspect_streamwish.js
 */

var vm = require('vm');

var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

var targets = [
    {
        name: "JKAnime (hgcloud.to)",
        url: "https://hgcloud.to/e/1wa6sleaafp2",
        id: "1wa6sleaafp2",
        base: "https://hgcloud.to",
        referer: "https://jkanime.net/"
    },
    {
        name: "SoloLatino (hglink.to)",
        url: "https://hglink.to/e/z773lo7bqkb2",
        id: "z773lo7bqkb2",
        base: "https://hglink.to",
        referer: "https://embed69.org/"
    }
];

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

function checkHtmlForM3u8(html) {
    if (!html) return null;
    var direct = html.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i);
    if (direct) return direct[0];

    var packMatch = html.match(/eval\(function\(p,a,c,k,e,[a-zA-Z0-9_]\)\{[\s\S]+?\}\(\s*['"]([\s\S]+?)['"]\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*['"]([\s\S]+?)['"]\.split\('\|'\)/i);
    if (packMatch) {
        var unpacked = unpackDeanEdwards(packMatch[1], parseInt(packMatch[2], 10), parseInt(packMatch[3], 10), packMatch[4].split("|"));
        var m3u8 = unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i);
        if (m3u8) return m3u8[0];
    }
    return null;
}

// ==========================================
// PRUEBA 1: VARIANTES DE RUTA (/e/, /f/, /d/)
// ==========================================

function testAlternativeRoutes(target) {
    console.log("\n=================================================================");
    console.log(">>> [FASE 1] PROBANDO RUTAS ALTERNAS EN " + target.name + " <<<");
    console.log("=================================================================");

    var paths = [
        target.base + "/e/" + target.id,
        target.base + "/f/" + target.id,
        target.base + "/d/" + target.id
    ];

    function tryPath(idx) {
        if (idx >= paths.length) return Promise.resolve();
        var pUrl = paths[idx];

        return fetch(pUrl, {
            headers: {
                "User-Agent": USER_AGENT,
                "Referer": target.referer
            },
            redirect: "follow"
        })
        .then(function(res) {
            return res.text().then(function(html) {
                console.log("-> Ruta [" + pUrl + "] -> Status:", res.status, "| Tamaño:", html.length, "bytes");

                var m3u8 = checkHtmlForM3u8(html);
                if (m3u8) {
                    console.log("   [+] ¡STREAM ENCONTRADO EN RUTA ALTERNA!:", m3u8);
                } else if (html.indexOf("main.js") !== -1) {
                    console.log("   [i] Devuelve el cascarón con main.js");
                }
                return tryPath(idx + 1);
            });
        })
        .catch(function(err) {
            console.log("   [-] Error en " + pUrl + ":", err.message);
            return tryPath(idx + 1);
        });
    }

    return tryPath(0);
}

// ==========================================
// PRUEBA 2: EMULACIÓN DEL LOADER MAIN.JS
// ==========================================

function testEmulateMainJs(target) {
    console.log("\n=================================================================");
    console.log(">>> [FASE 2] EJECUTANDO MAIN.JS EN ENTORNO EMULADO (" + target.name + ") <<<");
    console.log("=================================================================");

    var mainUrl = target.base + "/main.js?v=1.1.9";
    var embedPageUrl = target.base + "/e/" + target.id;

    return fetch(mainUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": embedPageUrl }
    })
    .then(function(res) { return res.text(); })
    .then(function(jsCode) {
        console.log("[+] main.js descargado (" + jsCode.length + " bytes). Inicializando sandbox...");

        var interceptedRequests = [];
        var interceptedInjections = [];

        // Mock básico del DOM y APIs de navegador para atrapar las acciones de main.js
        var sandbox = {
            window: {},
            document: {
                title: "Loading...",
                cookie: "",
                head: { appendChild: function() {} },
                body: {
                    appendChild: function(el) {
                        if (el && el.innerHTML) interceptedInjections.push(el.innerHTML);
                    },
                    innerHTML: ""
                },
                getElementById: function(id) {
                    return {
                        id: id,
                        style: {},
                        setAttribute: function() {},
                        appendChild: function() {},
                        innerHTML: ""
                    };
                },
                createElement: function(tag) {
                    return {
                        tagName: tag,
                        style: {},
                        setAttribute: function(k, v) {
                            if (k === "src") interceptedRequests.push({ type: "script-src", url: v });
                        },
                        appendChild: function() {}
                    };
                },
                querySelectorAll: function() { return []; },
                querySelector: function() { return null; },
                addEventListener: function() {}
            },
            location: {
                href: embedPageUrl,
                pathname: "/e/" + target.id,
                hostname: target.base.replace("https://", ""),
                search: "",
                protocol: "https:",
                replace: function(u) { interceptedRequests.push({ type: "location.replace", url: u }); },
                assign: function(u) { interceptedRequests.push({ type: "location.assign", url: u }); }
            },
            navigator: {
                userAgent: USER_AGENT,
                platform: "Win32",
                languages: ["es-ES", "es", "en"]
            },
            screen: { width: 1920, height: 1080 },
            setTimeout: function(fn) {
                try { fn(); } catch(e) {}
            },
            clearTimeout: function() {},
            setInterval: function() {},
            clearInterval: function() {},
            fetch: function(url, opts) {
                interceptedRequests.push({ type: "fetch", url: url, opts: opts });
                return Promise.resolve({
                    text: function() { return Promise.resolve(""); },
                    json: function() { return Promise.resolve({}); }
                });
            },
            console: {
                log: function() {},
                warn: function() {},
                error: function() {}
            }
        };

        sandbox.window = sandbox;

        try {
            var context = vm.createContext(sandbox);
            // Ejecutar el script ofuscado dentro del sandbox de Node
            vm.runInContext(jsCode, context, { timeout: 3000 });
            console.log("[+] main.js ejecutado dentro del sandbox sin crashear.");
        } catch (e) {
            console.log("[-] Error en ejecución del script:", e.message);
        }

        console.log("\n[+] Acciones interceptadas por el sandbox:");
        console.log("    Peticiones capturadas:", JSON.stringify(interceptedRequests, null, 2));
        if (interceptedInjections.length > 0) {
            console.log("    Inyecciones HTML capturadas:", interceptedInjections);
        }
    })
    .catch(function(err) {
        console.log("[-] Error en sandbox:", err.message);
    });
}

// Ejecutar pruebas en secuencia para ambos portales
testAlternativeRoutes(targets[0])
.then(function() { return testEmulateMainJs(targets[0]); })
.then(function() { return testAlternativeRoutes(targets[1]); })
.then(function() { return testEmulateMainJs(targets[1]); })
.then(function() {
    console.log("\n=================================================================");
    console.log(">>> FIN DEL EXPERIMENTO STREAMWISH <<<");
    console.log("=================================================================");
});
