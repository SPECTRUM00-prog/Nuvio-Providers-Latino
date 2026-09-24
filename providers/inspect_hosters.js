var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

console.log("[1] Consultando destino real de VOE (jamesbornmain.com):");
fetch("https://jamesbornmain.com/e/zx7awj8hlamp", {
    headers: { "User-Agent": USER_AGENT, "Referer": "https://voe.sx/" }
})
.then(function(r) { return r.text(); })
.then(function(t) {
    console.log("-> Tamaño recibido VOE:", t.length);
    var hls = t.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/gi) || t.match(/'hls':\s*'([^']+)'/i);
    console.log("[+] Enlace HLS de VOE:", hls ? hls[0] : "No encontrado directamente");
});

console.log("\n[2] Contenido completo de StreamWish (hglink.to):");
fetch("https://hglink.to/e/d27vn7ce07ma", {
    headers: { "User-Agent": USER_AGENT, "Referer": "https://embed69.org/" }
})
.then(function(r) { return r.text(); })
.then(function(t) {
    console.log("--- HTML COMPLETO HGLINK ---");
    console.log(t);
    console.log("----------------------------");
});
