/**
 * Diagnóstico directo de Embed69 (8 KB) para reparar SoloLatino y PelisPedia
 * Ejecutar: node providers/inspect_pelispedia.js
 */

var https = require('https');
var URL = 'https://embed69.org/f/tt0133093';

https.get(URL, {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://embed69.org/'
    }
}, function(res) {
    var chunks = [];
    res.on('data', function(c) { chunks.push(c); });
    res.on('end', function() {
        var html = Buffer.concat(chunks).toString('utf8');
        console.log('Status:', res.statusCode, '| Bytes:', html.length);
        console.log('============================================================');
        // Imprimir solo las líneas clave de scripts / variables / iframes
        var scripts = html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
        console.log('Scripts encontrados:', scripts.length);
        scripts.forEach(function(s, i) {
            console.log('\n--- Script #' + (i + 1) + ' ---');
            console.log(s.slice(0, 1800));
        });
        if (scripts.length === 0) {
            console.log(html.slice(0, 1500));
        }
    });
}).on('error', function(e) {
    console.log('Error:', e.message, e.cause || '');
});
