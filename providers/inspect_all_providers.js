/**
 * Probar fetch() con Origin/Accept en /api/player-url e inspeccionar player.pelisserieshoy.com/f/...?et=...
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

    console.log('1) Token obtenido:', tok ? 'OK' : 'NO', '| CSRF:', csrf ? 'OK' : 'NO');

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

    var apiText = await apiRes.text();
    console.log('2) fetch(/api/player-url) Status:', apiRes.status, '| Body:', apiText);

    if (apiRes.ok) {
        var json = JSON.parse(apiText);
        if (json && json.url) {
            console.log('\n3) Descargando player firmado:', json.url);
            var pRes = await fetch(json.url, {
                headers: { 'User-Agent': UA, 'Referer': 'https://sololatino.net/pelicula/matrix' },
                redirect: 'follow'
            });
            var pHtml = await pRes.text();
            console.log('   Status:', pRes.status, '| Final URL:', pRes.url, '| Bytes:', pHtml.length);
            console.log('   Tiene anubis:', pHtml.indexOf('anubis') !== -1);
            console.log('   Tiene dataLink:', pHtml.indexOf('dataLink') !== -1);
            console.log('   Tiene LINK_CHALLENGE:', pHtml.indexOf('LINK_CHALLENGE') !== -1);
            console.log('   Tiene POW_CHALLENGE:', pHtml.indexOf('POW_CHALLENGE') !== -1);

            if (pHtml.indexOf('dataLink') !== -1) {
                var dl = pHtml.match(/(?:const|let|var)\s+dataLink\s*=[\s\S]{0,450}/);
                if (dl) console.log('   dataLink preview:', dl[0]);
            } else {
                console.log('   Preview HTML:', pHtml.slice(0, 700).replace(/\s+/g, ' '));
            }
        }
    }
})();
