/**
 * Rastrear el componente padre que llama a 'dv' y le pasa 'embeds'
 * Ejecución: node providers/inspect_dv_caller.js
 */

var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var appJsUrl = "https://lamovie.org/wp-content/themes/lamovie/assets/build/static/assets/app.js?v=1787967824";

console.log("=================================================================");
console.log(">>> BUSCANDO LA LLAMADA A <dv embeds={...}> EN APP.JS <<<");
console.log("=================================================================");

fetch(appJsUrl, { headers: { "User-Agent": USER_AGENT } })
.then(function(res) { return res.text(); })
.then(function(code) {
    // 1. Buscar llamadas a dv (jsx(dv, o r.jsx(dv,)
    var calls = [];
    var regex = /(?:r\.jsx|jsx)\(dv\s*,\s*(\{[\s\S]*?\})/g;
    var m;
    while ((m = regex.exec(code)) !== null) {
        calls.push({ pos: m.index, snippet: m[1] });
    }

    console.log("[+] Invocaciones de 'dv' encontradas:", calls.length);

    for (var i = 0; i < calls.length; i++) {
        var c = calls[i];
        console.log("\n--- Invocación [" + (i + 1) + "] en pos " + c.pos + " ---");
        console.log(c.snippet.substring(0, 300).replace(/\r?\n\s*/g, " ") + "...");

        // Ver qué código hay 800 caracteres antes de esta invocación (donde se define la lógica)
        var start = Math.max(0, c.pos - 800);
        console.log("\nLógica previa a la invocación:\n");
        console.log(code.substring(start, c.pos).replace(/\r?\n\s*/g, " ") + "\n");
    }

    // 2. Si regex minificado no atrapó directamente r.jsx(dv, buscar "embeds:" en todo el archivo
    if (calls.length === 0) {
        console.log("\n[-] Buscando por ocurrencias literales de 'embeds:'...");
        var pos = code.indexOf("embeds:");
        var count = 0;
        while (pos !== -1) {
            count++;
            var s = Math.max(0, pos - 200);
            var e = Math.min(code.length, pos + 250);
            console.log("\n--- 'embeds:' [" + count + "] pos " + pos + " ---");
            console.log(code.substring(s, e).replace(/\r?\n\s*/g, " "));
            pos = code.indexOf("embeds:", pos + 1);
        }
    }
})
.catch(function(err) {
    console.error("[-] Error:", err.message);
});
