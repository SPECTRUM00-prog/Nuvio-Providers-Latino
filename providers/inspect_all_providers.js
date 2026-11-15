/**
 * Inspección de estructura de reproductor en sololatino.net/pelicula/matrix
 * Ejecutar: node providers/inspect_all_providers.js
 */

var https = require('https');
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

https.get('https://sololatino.net/pelicula/matrix', {
    headers: { 'User-Agent': UA, 'Referer': 'https://sololatino.net/' }
}, function(res) {
    var c = [];
    res.on('data', function(d) { c.push(d); });
    res.on('end', function() {
        var html = Buffer.concat(c).toString('utf8');
        console.log('Status:', res.statusCode, '| Bytes:', html.length);

        var hasNext = html.indexOf('__NEXT_DATA__') !== -1;
        console.log('Tiene __NEXT_DATA__:', hasNext);
        if (hasNext) {
            var nm = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
            if (nm) console.log('__NEXT_DATA__ preview:', nm[1].slice(0, 900));
        }

        var scripts = html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
        console.log('Scripts totales:', scripts.length);
        scripts.forEach(function(s, idx) {
            if (s.indexOf('embed') !== -1 || s.indexOf('player') !== -1 || s.indexOf('video') !== -1 || s.indexOf('lat') !== -1 || s.indexOf('tt0133093') !== -1) {
                console.log('\n--- Script candidato #' + (idx + 1) + ' ---');
                console.log(s.slice(0, 800));
            }
        });

        var allUrls = html.match(/https?:\/\/[^"'\s<>\\]+/gi) || [];
        var filtered = [];
        allUrls.forEach(function(u) {
            if (u.indexOf('sololatino.net') === -1 && u.indexOf('tmdb.org') === -1 && u.indexOf('googleapis') === -1 && u.indexOf('w3.org') === -1 && filtered.indexOf(u) === -1) {
                filtered.push(u);
            }
        });
        console.log('\nURLs externas en la ficha:', filtered.slice(0, 15));
    });
}).on('error', function(e) {
    console.log('Error:', e.message);
});
