/**
 * Verificación de KeKi (Directo) y Netu (hqq.ac)
 * Ejecución: node providers/inspect_pelisgo.js
 */

var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

var KEKI_M3U8 = "https://KOd1r07903QW.tnmr.org/hls2/03/03573/4c6ons7yhcaj_h/master.m3u8?t=LZypc_gxnhjlCqND4zyMeuP1OPL_-bJ96PT0lvX9Bms&s=1790380738&e=28800&f=17867412&i=0.3&sp=0";
var NETU_URL = "https://hqq.ac/e/b3p2YzZpV09mbCtPeFd5T2g3WVRSUT09";

console.log("==================================================");
console.log("[*] COMPROBACIÓN DE KEKI Y NETU");
console.log("==================================================\n");

// 1. Probar KeKi directo
console.log("[1] Probando stream directo de KeKi (.m3u8)...");
fetch(KEKI_M3U8, {
    headers: {
        "User-Agent": USER_AGENT,
        "Referer": "https://pelisgo.online/"
    }
})
.then(function(res) {
    console.log("   -> Status HTTP KeKi:", res.status, "(" + res.headers.get("content-type") + ")");
    return res.text();
})
.then(function(text) {
    if (text.indexOf("#EXTM3U") !== -1) {
        console.log("   [✓] ¡KEKI ESTÁ VIVO Y ES UN HLS VÁLIDO! (Contiene #EXTM3U)");
        console.log("   Primeras líneas de la lista HLS:");
        console.log("   " + text.split("\n").slice(0, 4).join("\n   "));
    } else {
        console.log("   [-] No devolvió una lista M3U8 válida.");
    }
})
.catch(function(err) {
    console.log("   [-] Error KeKi:", err.message);
})
.then(function() {
    // 2. Probar Netu (hqq.ac)
    console.log("\n[2] Probando reproductor Netu (Breaking Bad)...");
    return fetch(NETU_URL, {
        headers: {
            "User-Agent": USER_AGENT,
            "Referer": "https://pelisgo.online/"
        },
        redirect: "follow"
    });
})
.then(function(res) {
    console.log("   -> Status HTTP Netu:", res.status, "(" + res.headers.get("content-type") + ")");
    return res.text();
})
.then(function(html) {
    console.log("   -> Tamaño recibido Netu:", html.length, "caracteres");
    var m3u8 = html.match(/https?:\/\/[^"'\s<>]+\.(?:m3u8|mp4)[^"'\s<>]*/gi);
    if (m3u8) {
        console.log("   [+] Stream encontrado en Netu:", m3u8[0]);
    } else {
        console.log("   [-] Netu no expone enlace directo.");
        console.log("   Fragmento HTML:");
        console.log(html.substring(0, 250));
    }
})
.catch(function(err) {
    console.log("   [-] Error Netu:", err.message);
});
