/**
 * Diagnóstico exacto del bloque ln0 (Latino)
 * Ejecutar: node providers/inspect_pelisforte.js
 */

var https = require('https');
var PAGE_URL = 'https://www2.pelisforte.se/pelicula/paranorman-2012-1699022692';
var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

https.get(PAGE_URL, { headers: { 'User-Agent': USER_AGENT } }, function(res) {
    var chunks = [];
    res.on('data', function(c) { chunks.push(c); });
    res.on('end', function() {
        var html = Buffer.concat(chunks).toString('utf8');

        var posLn0 = html.indexOf('id="ln0"');
        console.log('\n============================================================');
        console.log('>>> BLOQUE COMPLETO DE id="ln0" (LATINO)');
        console.log('============================================================');
        if (posLn0 !== -1) {
            console.log(html.substring(posLn0, posLn0 + 800));
        } else {
            console.log('No se encontró id="ln0"');
        }

        console.log('\n============================================================');
        console.log('>>> BUSCANDO CUALQUIER REFERENCIA A #options-1 EN TODO EL HTML');
        console.log('============================================================');
        var posOpt1 = html.indexOf('#options-1');
        if (posOpt1 !== -1) {
            console.log(html.substring(posOpt1 - 40, posOpt1 + 160));
        } else {
            console.log('No existe "#options-1" en el HTML');
        }
    });
});
