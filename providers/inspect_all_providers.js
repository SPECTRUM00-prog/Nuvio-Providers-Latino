/**
 * Diagnóstico de estructura de reproductores en pelisgo.online
 * Ejecutar: node providers/inspect_all_providers.js
 */

var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

(async function() {
    var target = 'https://pelisgo.online/movies/coraline-y-la-puerta-secreta';
    var res = await fetch(target, { headers: { 'User-Agent': UA, 'Referer': 'https://pelisgo.online/' } });
    var html = await res.text();
    console.log('Status:', res.status, '| Final:', res.url, '| Bytes:', html.length);

    var iframes = html.match(/<iframe[^>]+(?:src|data-src)=["']([^"']+)["']/gi) || [];
    console.log('\n[IFRAMES]:', iframes);

    var dataAttrs = html.match(/data-(?:url|src|embed|player|server|id|lang|video)=["']([^"']+)["']/gi) || [];
    console.log('\n[DATA-* PLAYER ATTRS]:', dataAttrs.slice(0, 20));

    console.log('\n[__NEXT_DATA__]:', html.indexOf('__NEXT_DATA__') !== -1);
    var nextM = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nextM) console.log(nextM[1].slice(0, 1200));

    var scripts = html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
    scripts.forEach(function(s, i) {
        if (s.indexOf('keki') !== -1 || s.indexOf('embed') !== -1 || s.indexOf('player') !== -1 || s.indexOf('/api/') !== -1 || s.indexOf('streams') !== -1 || s.indexOf('m3u8') !== -1) {
            console.log('\n--- Script candidato #' + (i + 1) + ' (' + s.length + ' chars) ---');
            console.log(s.slice(0, 1000));
        }
    });
})();
