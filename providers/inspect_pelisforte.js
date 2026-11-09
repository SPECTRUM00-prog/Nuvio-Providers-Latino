/**
 * Diagnóstico de Mapeo de Idiomas en PelisForte
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

        console.log('\n============================================================');
        console.log('>>> 1. MAPEO DE PESTAÑAS (ln0, ln1, ln2)');
        console.log('============================================================');

        var langBlocks = [
            { id: 'ln0', label: 'LAT' },
            { id: 'ln1', label: 'CAST' },
            { id: 'ln2', label: 'SUB' }
        ];

        var parsedOptions = [];

        langBlocks.forEach(function(lb) {
            var blockIdx = html.indexOf('id="' + lb.id + '"');
            if (blockIdx === -1) return;
            var blockHtml = html.substring(blockIdx, blockIdx + 1200);

            var optRegex = /href=["']#options-(\d+)["'][^>]*>[\s\S]*?<span class=["']server["']>([^<]+)<\/span>/gi;
            var m;
            while ((m = optRegex.exec(blockHtml)) !== null) {
                parsedOptions.push({
                    optId: m[1],
                    server: m[2].replace(/\s+/g, ' ').trim(),
                    lang: lb.label
                });
            }
        });

        console.log('Opciones encontradas en las pestañas:', parsedOptions);

        console.log('\n============================================================');
        console.log('>>> 2. CONTENEDORES DE IFRAMES (#options-0, #options-1, etc.)');
        console.log('============================================================');

        // Buscar cada div id="options-X"
        for (var i = 0; i < 6; i++) {
            var targetId = 'id="options-' + i + '"';
            var pos = html.indexOf(targetId);
            if (pos !== -1) {
                var divSnippet = html.substring(pos, pos + 400);
                var tokenMatch = divSnippet.match(/mp4\.nu\/\?h=([^"'\s]+)/);
                console.log('[options-' + i + '] Token: ' + (tokenMatch ? tokenMatch[1].substring(0, 35) + '...' : 'NO DETECTADO'));
            }
        }
    });
});
