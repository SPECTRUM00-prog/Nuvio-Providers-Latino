/**
 * Inspección exacta de _qk, _qt y _qsrc en player.pelisserieshoy.com
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
    var apiJson = await apiRes.json();

    var pRes = await fetch(apiJson.url, {
        headers: { 'User-Agent': UA, 'Referer': 'https://sololatino.net/pelicula/matrix' }
    });
    var pHtml = await pRes.text();

    var qkIdx = pHtml.indexOf('_qk');
    if (qkIdx !== -1) {
        console.log('=== BLOQUE COMPLETO _qk / _qv / _qt / _qsrc ===');
        console.log(pHtml.slice(Math.max(0, qkIdx - 60), qkIdx + 1800));
    }

    var qtIdx = pHtml.indexOf('_qt');
    if (qtIdx !== -1 && Math.abs(qtIdx - qkIdx) > 1500) {
        console.log('\n=== BLOQUE _qt ===');
        console.log(pHtml.slice(Math.max(0, qtIdx - 120), qtIdx + 600));
    }
})();
