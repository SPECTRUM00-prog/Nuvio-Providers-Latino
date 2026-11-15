/**
 * Volcado de fuentes/embeds dentro de player.pelisserieshoy.com/f/tt0133093?et=...
 * Ejecutar: node providers/inspect_all_providers.js
 */

var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

(async function() {
    var pageRes = await fetch('https://sololatino.net/pelicula/matrix', {
        headers: { 'User-Agent': UA, 'Referer': 'https://sololatino.net/' }
    });
    var html = await pageRes.text();
    var csrf = (html.match(/name="csrf-token"\s+content="([^"]+)"/i) || [])[1] || '';
    var tok = (html.match(/data-player-token="([^"]+)"/i) || [])[1] || '';

    var apiRes = await fetch('https://sololatino.net/api/player-url', {
        method: 'POST',
        headers: {
            'User-Agent': UA,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Origin': 'https://sololatino.net',
            'Referer': 'https://sololatino.net/pelicula/matrix',
            'X-CSRF-TOKEN': csrf,
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ t: tok })
    });
    var json = await apiRes.json();
    var pRes = await fetch(json.url, {
        headers: { 'User-Agent': UA, 'Referer': 'https://sololatino.net/pelicula/matrix' },
        redirect: 'follow'
    });
    var pHtml = await pRes.text();

    console.log('Bytes totales:', pHtml.length);

    var urls = pHtml.match(/https?:\/\/[^"'\s<>\\]+/gi) || [];
    var uniq = [];
    urls.forEach(function(u) {
        if (u.indexOf('w3.org') === -1 && u.indexOf('googleapis') === -1 && u.indexOf('tmdb.org') === -1 && uniq.indexOf(u) === -1) {
            uniq.push(u);
        }
    });
    console.log('\n[URLS ENCONTRADAS]:', uniq.slice(0, 20));

    var scripts = pHtml.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi) || [];
    console.log('\n[SCRIPTS TOTALES]:', scripts.length);
    scripts.forEach(function(s, i) {
        if (s.indexOf('isAllowedHost') !== -1) return;
        if (s.length > 80) {
            console.log('\n--- Script #' + (i + 1) + ' (' + s.length + ' chars) ---');
            console.log(s.slice(0, 1400));
        }
    });

    // Buscar cualquier arreglo/JSON/atob/fetch dentro del HTML
    var b64 = pHtml.match(/aHR0c(?:HM6|Dov)[A-Za-z0-9+/=_-]+/g) || [];
    console.log('\n[TOKENS BASE64 aHR0c...]:', b64.slice(0, 10));
})();
