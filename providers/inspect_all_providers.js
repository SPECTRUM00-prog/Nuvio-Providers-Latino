/**
 * Inspección de player.pelisserieshoy.com/e/517175 y comportamiento de fetch en /api/player-url
 * Ejecutar: node providers/inspect_all_providers.js
 */

var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

(async function() {
    console.log('>>> 1. INSPECCIONANDO https://player.pelisserieshoy.com/e/517175');
    var pRes = await fetch('https://player.pelisserieshoy.com/e/517175', {
        headers: { 'User-Agent': UA, 'Referer': 'https://sololatino.net/pelicula/matrix' },
        redirect: 'follow'
    });
    var pHtml = await pRes.text();
    console.log('Status:', pRes.status, '| Final:', pRes.url, '| Bytes:', pHtml.length);

    var m3u8 = pHtml.match(/https?:\/\/[^"'\s<>\\]+\.(?:m3u8|mp4)[^"'\s<>\\]*/gi) || [];
    console.log('Streams directos (.m3u8/.mp4):', m3u8.slice(0, 5));

    var iframes = pHtml.match(/<iframe[^>]+src=["']([^"']+)["']/gi) || [];
    console.log('Iframes dentro:', iframes);

    var hasPack = pHtml.indexOf('eval(function(p,a,c,k') !== -1;
    console.log('Tiene Dean Edwards packer:', hasPack);

    if (m3u8.length === 0 && iframes.length === 0) {
        console.log('Preview HTML:\n' + pHtml.slice(0, 1200));
    }

    console.log('\n>>> 2. PROBANDO /api/player-url CON fetch() NATIVO');
    var pageRes = await fetch('https://sololatino.net/pelicula/matrix', {
        headers: { 'User-Agent': UA, 'Referer': 'https://sololatino.net/' }
    });
    var pageHtml = await pageRes.text();
    var csrf = (pageHtml.match(/name="csrf-token"\s+content="([^"]+)"/i) || [])[1] || '';
    var tok = (pageHtml.match(/data-player-token="([^"]+)"/i) || [])[1] || '';

    // Extraer cookies compatibles con fetch (getSetCookie si existe, o header set-cookie)
    var rawCookies = typeof pageRes.headers.getSetCookie === 'function'
        ? pageRes.headers.getSetCookie()
        : (pageRes.headers.get('set-cookie') ? [pageRes.headers.get('set-cookie')] : []);
    var cookieStr = rawCookies.map(function(c) { return c.split(';')[0]; }).join('; ');

    var apiNoCookie = await fetch('https://sololatino.net/api/player-url', {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf, 'X-Requested-With': 'XMLHttpRequest', 'Referer': 'https://sololatino.net/pelicula/matrix' },
        body: JSON.stringify({ t: tok })
    });
    console.log('POST SIN Cookie header:', apiNoCookie.status, await apiNoCookie.text());

    var apiWithCookie = await fetch('https://sololatino.net/api/player-url', {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf, 'X-Requested-With': 'XMLHttpRequest', 'Cookie': cookieStr, 'Referer': 'https://sololatino.net/pelicula/matrix' },
        body: JSON.stringify({ t: tok })
    });
    console.log('POST CON Cookie header:', apiWithCookie.status, await apiWithCookie.text());
})();
