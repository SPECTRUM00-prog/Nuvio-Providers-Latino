/**
 * Extractor de video para GoodStream (Flix) y SeekStreaming
 * Ejecución: node providers/inspect_pelisgo.js
 */

var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

console.log("[1] Analizando GoodStream (Flix)...");
fetch("https://goodstream.one/e/ddmcxni462sv", {
    headers: { "User-Agent": USER_AGENT, "Referer": "https://pelisgo.online/" }
})
.then(function(r) { return r.text(); })
.then(function(t) {
    var m3u8 = t.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i) || t.match(/(?:file|sources)\s*:\s*["']([^"']+)["']/i);
    console.log("   -> GoodStream m3u8 detectado:", m3u8 ? (m3u8[1] || m3u8[0]) : "Requiere unpack");
});

console.log("\n[2] Analizando SeekStreaming...");
fetch("https://prueba.embedseek.com/#jviq3", {
    headers: { "User-Agent": USER_AGENT, "Referer": "https://pelisgo.online/" }
})
.then(function(r) { return r.text(); })
.then(function(t) {
    console.log("--- HTML DE SEEKSTREAMING ---");
    console.log(t);
    console.log("-----------------------------");
});
