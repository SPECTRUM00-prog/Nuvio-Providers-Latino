/**
 * Ver llamadas a /s.php y playStream() dentro de Script #5 de player.pelisserieshoy.com
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
    var idxT = pHtml.indexOf('const _t =');
    var script5 = pHtml.slice(idxT - 40, pHtml.indexOf('</script>', idxT));

    ['playStream(', '/s.php', 'atob(', 'JSON.parse'].forEach(function(term) {
        console.log('\n=== BUSCANDO "' + term + '" ===');
        var i = 0, c = 0;
        while ((i = script5.indexOf(term, i)) !== -1 && c < 8) {
            console.log('[' + (++c) + '] ' + script5.slice(Math.max(0, i - 100), i + 260).replace(/\s+/g, ' '));
            i += term.length;
        }
    });
})();
