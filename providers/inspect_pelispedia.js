/**
 * Extracción de getLinkKey, decryptAES y dataLink en pelispedia.mov/vidurl/tt0133093/
 * Ejecutar: node providers/inspect_pelispedia.js
 */

var https = require('https');

https.get('https://pelispedia.mov/vidurl/tt0133093/', {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://pelispedia.mov/pelicula/matrix'
    }
}, function(res) {
    var chunks = [];
    res.on('data', function(c) { chunks.push(c); });
    res.on('end', function() {
        var html = Buffer.concat(chunks).toString('utf8');

        // 1. Imprimir desde donde empieza getLinkKey (o decryptAES)
        var gkIdx = html.indexOf('getLinkKey');
        if (gkIdx !== -1) {
            console.log('=== getLinkKey & decryptAES ===');
            console.log(html.slice(Math.max(0, gkIdx - 120), gkIdx + 2200));
        }

        // 2. Buscar la definición real de dataLink = [ ... ]
        var dlMatches = html.match(/(?:const|let|var)\s+dataLink\s*=[\s\S]{0,600}/gi) || [];
        console.log('\n=== DEFINICIÓN DE dataLink ===');
        console.log(dlMatches.length > 0 ? dlMatches[0] : 'No encontrada con const/let/var dataLink =');
    });
}).on('error', function(e) {
    console.log('Error:', e.message);
});
