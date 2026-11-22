/**
 * Inspección de todos los servidores y pestañas de Coraline en PelisForte
 * Ejecutar: node providers/inspect_pelisforte.js
 */

var https = require('https');
var TARGET = 'https://www2.pelisforte.se/pelicula/coraline-2009-1602884329';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

https.get(TARGET, { headers: { 'User-Agent': UA, 'Referer': 'https://www2.pelisforte.se/' } }, function(res) {
    var chunks = [];
    res.on('data', function(c) { chunks.push(c); });
    res.on('end', function() {
        var html = Buffer.concat(chunks).toString('utf8');
        console.log('Status:', res.statusCode, '| Bytes:', html.length);

        // 1. Ver qué pestañas de idioma existen
        var tabs = html.match(/<span\s+tab=["']([^"']+)["'][^>]*>([\s\S]*?)<\/span>/gi) || [];
        console.log('\n=== PESTAÑAS DE IDIOMA ===');
        tabs.forEach(function(t) { console.log(t.replace(/\s+/g, ' ')); });

        // 2. Ver todas las opciones y sus nombres de servidor
        var opts = html.match(/<a\s+[^>]*href=["']#options-\d+["'][^>]*>([\s\S]*?)<\/a>/gi) || [];
        console.log('\n=== BOTONES DE SERVIDOR DETECTADOS (' + opts.length + ') ===');
        opts.forEach(function(o, i) {
            console.log('[' + (i + 1) + '] ' + o.replace(/\s+/g, ' '));
        });

        // 3. Ver todos los iframes mp4.nu
        var iframes = html.match(/id=["']options-\d+["'][^>]*>[\s\S]*?<iframe[^>]+src=["'](https?:\/\/mp4\.nu\/\?h=[^"']+)["']/gi) || [];
        console.log('\n=== IFRAMES DE mp4.nu (' + iframes.length + ') ===');
        iframes.forEach(function(ifr, i) {
            console.log('[' + (i + 1) + '] ' + ifr.replace(/\s+/g, ' '));
        });
    });
}).on('error', function(e) {
    console.log('Error:', e.message);
});
