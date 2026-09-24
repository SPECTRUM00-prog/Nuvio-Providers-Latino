/**
 * Inspección de scripts internos en StreamWish (hglink) y VOE
 */
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

console.log("[1] Script interno de StreamWish (hglink.to):");
fetch("https://hglink.to/e/d27vn7ce07ma", { headers: { "User-Agent": USER_AGENT, "Referer": "https://embed69.org/" } })
    .then(function(r) { return r.text(); })
    .then(function(t) {
        var scripts = t.match(/<script[\s\S]*?<\/script>/gi) || [];
        for (var i = 0; i < scripts.length; i++) console.log(scripts[i]);
    });

console.log("\n[2] Script de redirección de VOE (voe.sx):");
fetch("https://voe.sx/e/zx7awj8hlamp", { headers: { "User-Agent": USER_AGENT, "Referer": "https://embed69.org/" } })
    .then(function(r) { return r.text(); })
    .then(function(t) {
        var scripts = t.match(/<script[\s\S]*?<\/script>/gi) || [];
        for (var i = 0; i < scripts.length; i++) console.log(scripts[i]);
    });
