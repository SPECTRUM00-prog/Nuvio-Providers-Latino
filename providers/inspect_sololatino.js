/**
 * Auditoría profunda de los botones Principal, SLPLAYER y VIP de sololatino.net
 * Ejecución: node providers/inspect_sololatino.js
 */

var TARGET_URL = "https://sololatino.net/pelicula/coraline-y-la-puerta-secreta";
var BASE_URL = "https://sololatino.net";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

var defaultHeaders = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": BASE_URL + "/"
};

console.log("=================================================================");
console.log(">>> [1/3] DESCARGANDO PÁGINA Y BUSCANDO EL CONTROLADOR JS <<<");
console.log("=================================================================");

fetch(TARGET_URL, { headers: defaultHeaders })
.then(function(res) { return res.text(); })
.then(function(html) {
    // 1. Extraer CSRF Token si existe en <meta>
    var csrfMatch = html.match(/<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)["']/i);
    var csrfToken = csrfMatch ? csrfMatch[1] : "";
    console.log("[+] CSRF Token:", csrfToken || "No encontrado");

    // 2. Extraer los tokens de los 3 botones
    var buttons = [];
    var btnRegex = /<button[^>]+data-server-btn[^>]+data-player-token=["']([^"']+)["'][^>]*>([\s\S]*?)<\/button>/gi;
    var bm;
    while ((bm = btnRegex.exec(html)) !== null) {
        var token = bm[1];
        var label = bm[2].replace(/<[^>]+>/g, "").trim();
        buttons.push({ label: label, token: token });
    }

    console.log("\n[+] Botones encontrados (" + buttons.length + "):");
    for (var b = 0; b < buttons.length; b++) {
        console.log("    [" + (b + 1) + "] " + buttons[b].label + " -> Token: " + buttons[b].token.substring(0, 45) + "...");
    }

    // 3. Buscar en todos los scripts inline la lógica que manipula 'data-player-token'
    console.log("\n=================================================================");
    console.log(">>> [2/3] RASTREANDO CÓDIGO JS QUE MANIPULA data-player-token <<<");
    console.log("=================================================================");

    var scripts = [];
    var sRegex = /<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi;
    var sm;
    var foundLogic = false;

    while ((sm = sRegex.exec(html)) !== null) {
        var jsContent = sm[1];
        if (jsContent.indexOf("data-player-token") !== -1 || jsContent.indexOf("server-btn") !== -1 || jsContent.indexOf("player-frame") !== -1) {
            foundLogic = true;
            console.log("[!] ¡LÓGICA DEL REPRODUCTOR ENCONTRADA EN SCRIPT INLINE!:\n");
            console.log(jsContent.trim().substring(0, 1200));
            console.log("\n-------------------------------------------------------------\n");
        }
    }

    if (!foundLogic) {
        console.log("[-] No está inline. Buscando en los archivos .js referenciados...");
        var srcRegex = /<script[^>]+src=["']([^"']+\.js(?:\?[^"']*)?)["']/gi;
        var srcMatch;
        var extScripts = [];
        while ((srcMatch = srcRegex.exec(html)) !== null) {
            var sUrl = srcMatch[1];
            if (sUrl.indexOf("gtag") === -1 && sUrl.indexOf("cloudflare") === -1) {
                if (sUrl.indexOf("http") !== 0) sUrl = BASE_URL + (sUrl.indexOf("/") === 0 ? "" : "/") + sUrl;
                extScripts.push(sUrl);
            }
        }
        console.log("Scripts externos a revisar (" + extScripts.length + "):", extScripts);
    }

    // 4. Probar las peticiones candidatas para enviar el token
    console.log("=================================================================");
    console.log(">>> [3/3] PROBANDO RUTAS CANDIDATAS PARA LOS TOKENS <<<");
    console.log("=================================================================");

    if (buttons.length === 0) return;

    var testBtn = buttons[0]; // Usar el primero (ej. Principal)
    console.log("Probando con botón:", testBtn.label);

    var candidateRequests = [
        // Método POST con JSON
        { method: "POST", url: BASE_URL + "/player", body: JSON.stringify({ token: testBtn.token }), headers: { "Content-Type": "application/json", "X-CSRF-TOKEN": csrfToken, "X-Requested-With": "XMLHttpRequest", "Referer": TARGET_URL } },
        { method: "POST", url: BASE_URL + "/api/player", body: JSON.stringify({ token: testBtn.token }), headers: { "Content-Type": "application/json", "X-CSRF-TOKEN": csrfToken, "X-Requested-With": "XMLHttpRequest", "Referer": TARGET_URL } },
        { method: "POST", url: BASE_URL + "/ajax/player", body: "token=" + encodeURIComponent(testBtn.token), headers: { "Content-Type": "application/x-www-form-urlencoded", "X-CSRF-TOKEN": csrfToken, "X-Requested-With": "XMLHttpRequest", "Referer": TARGET_URL } },
        // Método GET con query params
        { method: "GET", url: BASE_URL + "/player?token=" + encodeURIComponent(testBtn.token), headers: { "Referer": TARGET_URL } },
        { method: "GET", url: BASE_URL + "/play/" + encodeURIComponent(testBtn.token), headers: { "Referer": TARGET_URL } },
        { method: "GET", url: BASE_URL + "/reproductor?token=" + encodeURIComponent(testBtn.token), headers: { "Referer": TARGET_URL } }
    ];

    function runCandidate(idx) {
        if (idx >= candidateRequests.length) {
            console.log("\n=== FIN DE PRUEBAS CANDIDATAS ===");
            return;
        }

        var req = candidateRequests[idx];
        var opts = {
            method: req.method,
            headers: Object.assign({}, defaultHeaders, req.headers || {})
        };
        if (req.body) opts.body = req.body;

        fetch(req.url, opts)
        .then(function(res) {
            return res.text().then(function(text) {
                var preview = text.substring(0, 200).replace(/\r?\n\s*/g, " ");
                console.log("\n[" + res.status + "] " + req.method + " -> " + req.url.substring(0, 60) + "...");
                if (res.status === 200) {
                    console.log("    [+] ¡RESPUESTA 200 OK! Contenido: " + preview);
                } else {
                    console.log("    [-] Status " + res.status + ": " + preview);
                }
                runCandidate(idx + 1);
            });
        })
        .catch(function(err) {
            console.log("    [-] Error en " + req.url + ":", err.message);
            runCandidate(idx + 1);
        });
    }

    runCandidate(0);
})
.catch(function(err) {
    console.error("[-] ERROR GENERAL:", err.message);
});
