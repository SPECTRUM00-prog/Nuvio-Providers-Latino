/**
 * Extracción real de los 3 servidores (Principal, SLPLAYER, VIP) vía /api/player-url
 * Ejecución: node providers/inspect_sololatino.js
 */

var TARGET_URL = "https://sololatino.net/pelicula/coraline-y-la-puerta-secreta";
var BASE_URL = "https://sololatino.net";
var API_URL = BASE_URL + "/api/player-url";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

console.log("=================================================================");
console.log(">>> [1/2] OBTENIENDO TOKENS Y CSRF DE SOLOLATINO.NET <<<");
console.log("=================================================================");

fetch(TARGET_URL, {
    headers: {
        "User-Agent": USER_AGENT,
        "Referer": BASE_URL + "/"
    }
})
.then(function(res) { return res.text(); })
.then(function(html) {
    // 1. Extraer CSRF Token
    var csrfMatch = html.match(/<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)["']/i);
    var csrfToken = csrfMatch ? csrfMatch[1] : "";
    console.log("[+] CSRF Token detectado:", csrfToken);

    // 2. Extraer todos los botones de reproductor (Principal, SLPLAYER, VIP)
    var buttons = [];
    var btnRegex = /<button[^>]+data-server-btn[^>]+data-player-token=["']([^"']+)["'][^>]*>([\s\S]*?)<\/button>/gi;
    var bm;

    while ((bm = btnRegex.exec(html)) !== null) {
        var token = bm[1];
        var label = bm[2].replace(/<[^>]+>/g, "").trim();
        buttons.push({ label: label, token: token });
    }

    console.log("[+] Total de botones encontrados:", buttons.length);

    console.log("\n=================================================================");
    console.log(">>> [2/2] RESOLVIENDO CADA SERVIDOR EN /api/player-url <<<");
    console.log("=================================================================");

    function resolveButton(index) {
        if (index >= buttons.length) {
            console.log("\n=================================================================");
            console.log(">>> INSPECCIÓN COMPLETADA CON ÉXITO <<<");
            console.log("=================================================================");
            return;
        }

        var btn = buttons[index];
        console.log("\n-----------------------------------------------------------------");
        console.log("[" + (index + 1) + "/" + buttons.length + "] Consultando botón: \"" + btn.label + "\"");

        var apiHeaders = {
            "User-Agent": USER_AGENT,
            "Content-Type": "application/json",
            "Accept": "application/json, text/plain, */*",
            "X-CSRF-TOKEN": csrfToken,
            "X-Requested-With": "XMLHttpRequest",
            "Referer": TARGET_URL,
            "Origin": BASE_URL
        };

        fetch(API_URL, {
            method: "POST",
            headers: apiHeaders,
            body: JSON.stringify({ t: btn.token })
        })
        .then(function(res) {
            return res.text().then(function(text) {
                console.log("   -> Status HTTP API:", res.status);
                try {
                    var json = JSON.parse(text);
                    console.log("   [+] RESPUESTA JSON:", JSON.stringify(json, null, 2));

                    if (json.url) {
                        console.log("   -> URL RESUELTA:", json.url);
                        console.log("   -> TIPO:", json.type || "iframe");
                    }
                } catch(e) {
                    console.log("   [-] No es JSON:", text.substring(0, 200));
                }
                resolveButton(index + 1);
            });
        })
        .catch(function(err) {
            console.log("   [-] Error en petición:", err.message);
            resolveButton(index + 1);
        });
    }

    resolveButton(0);
})
.catch(function(err) {
    console.error("[-] ERROR GENERAL:", err.message);
});
