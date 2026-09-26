/**
 * Diagnóstico de conectividad: Filemoon, GoodStream y SeekStreaming
 * Ejecución: node providers/inspect_pelisgo.js
 */

var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

var testUrls = [
    { name: "Filemoon JS",     url: "https://filemoon.sx/assets/index-DocunfmE.js", referer: "https://filemoon.sx/" },
    { name: "GoodStream (Flix)", url: "https://goodstream.one/e/ddmcxni462sv", referer: "https://pelisgo.online/" },
    { name: "SeekStreaming",   url: "https://prueba.embedseek.com/#jviq3", referer: "https://pelisgo.online/" }
];

console.log("==================================================");
console.log("[*] DIAGNÓSTICO DE CONECTIVIDAD DE HOSTERS");
console.log("==================================================\n");

function testOne(idx) {
    if (idx >= testUrls.length) return;
    var item = testUrls[idx];
    console.log("-> Probando:", item.name);
    console.log("   URL:", item.url);

    fetch(item.url, {
        headers: { "User-Agent": USER_AGENT, "Referer": item.referer },
        redirect: "follow"
    })
    .then(function(res) {
        console.log("   ✓ Status:", res.status, res.statusText);
        return res.text().then(function(t) {
            console.log("   ✓ Tamaño recibido:", t.length, "caracteres\n");
        });
    })
    .catch(function(err) {
        console.log("   ✗ Falló:", err.message);
        if (err.cause) {
            console.log("   ✗ Causa:", err.cause.code || err.cause.message || err.cause);
        }
        console.log("");
    })
    .then(function() {
        testOne(idx + 1);
    });
}

testOne(0);
