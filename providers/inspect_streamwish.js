/**
 * Emulador avanzado de main.js para StreamWish
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

function emulate(target) {
    console.log("=================================================================");
    console.log(">>> EJECUTANDO MAIN.JS CON ENTORNO COMPLETO (" + target.name + ") <<<");
    console.log("=================================================================");

    var mainUrl = target.base + "/main.js?v=1.1.9";
    var embedPageUrl = target.base + "/e/" + target.id;

    return fetch(mainUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": embedPageUrl }
    })
    .then(function(res) { return res.text(); })
    .then(function(jsCode) {
        console.log("[+] main.js descargado (" + jsCode.length + " bytes). Inicializando emulación...");

        var interceptedRequests = [];
        var interceptedInjections = [];

        function MockXHR() {
            this.headers = {};
            this.open = function(method, url) {
                this.method = method;
                this.url = url;
            };
            this.setRequestHeader = function(k, v) {
                this.headers[k] = v;
            };
            this.send = function(body) {
                interceptedRequests.push({ type: "xhr", method: this.method, url: this.url, body: body, headers: this.headers });
            };
        }

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
                            if (k === "src") interceptedRequests.push({ type: "script-tag-src", url: v });
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
                origin: target.base,
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
            URL: global.URL,
            URLSearchParams: global.URLSearchParams,
            atob: function(b64) { return Buffer.from(b64, 'base64').toString('binary'); },
            btoa: function(str) { return Buffer.from(str, 'binary').toString('base64'); },
            TextEncoder: global.TextEncoder,
            TextDecoder: global.TextDecoder,
            XMLHttpRequest: MockXHR,
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
            vm.runInContext(jsCode, context, { timeout: 3500 });
            console.log("[+] main.js ejecutado con éxito.");
        } catch (e) {
            console.log("[-] Error durante ejecución de main.js:", e.message);
        }

        console.log("\n[+] Acciones interceptadas (" + interceptedRequests.length + "):");
        if (interceptedRequests.length > 0) {
            console.log(JSON.stringify(interceptedRequests, null, 2));
        } else {
            console.log("    (No se dispararon peticiones directas de red)");
        }

        if (interceptedInjections.length > 0) {
            console.log("\n[+] Inyecciones en DOM:", interceptedInjections);
        }
    })
    .catch(function(err) {
        console.log("[-] Error general:", err.message);
    });
}

emulate(targets[0])
.then(function() { return emulate(targets[1]); })
.then(function() {
    console.log("\n=================================================================");
    console.log(">>> FIN DE LA EMULACIÓN DE STREAMWISH <<<");
    console.log("=================================================================");
});
