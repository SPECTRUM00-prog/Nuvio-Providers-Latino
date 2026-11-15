/**
 * Inspección del player interno /vidurl/ en PelisPedia y rutas de SoloLatino.
 * Ejecutar: node providers/inspect_pelispedia.js
 */

var https = require('https');
var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function get(url, referer) {
    return new Promise(function(resolve, reject) {
        https.get(url, {
            headers: {
                'User-Agent': USER_AGENT,
                'Referer': referer || 'https://pelispedia.mov/'
            }
        }, function(res) {
            var chunks = [];
            res.on('data', function(c) { chunks.push(c); });
            res.on('end', function() {
                resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') });
            });
        }).on('error', reject);
    });
}

console.log('>>> 1. INSPECCIONANDO VARIABLES DEL PLAYER EN pelispedia.mov/vidurl/tt0133093/');
get('https://pelispedia.mov/vidurl/tt0133093/', 'https://pelispedia.mov/pelicula/matrix')
    .then(function(res) {
        var html = res.body;
        console.log('Has POW_CHALLENGE:', html.indexOf('POW_CHALLENGE') !== -1);
        console.log('Has POW_DIFFICULTY:', html.indexOf('POW_DIFFICULTY') !== -1);
        console.log('Has POW_SALT:', html.indexOf('POW_SALT') !== -1);
        console.log('Has dataLink:', html.indexOf('dataLink') !== -1);

        var dlIdx = html.indexOf('dataLink');
        if (dlIdx !== -1) {
            console.log('\n[CONTEXTO DE dataLink / POW]:');
            console.log(html.slice(Math.max(0, dlIdx - 350), dlIdx + 700));
        } else {
            // Buscar otro script de datos
            var scripts = html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
            console.log('Scripts encontrados:', scripts.length);
            scripts.forEach(function(s, i) {
                if (s.indexOf('sortedEmbeds') !== -1 || s.indexOf('file') !== -1 || s.indexOf('link') !== -1) {
                    console.log('\n--- Script candidato #' + (i + 1) + ' ---');
                    console.log(s.slice(0, 900));
                }
            });
        }

        console.log('\n>>> 2. REVISANDO ENLACES REALES EN sololatino.net/?s=matrix');
        return get('https://sololatino.net/?s=matrix', 'https://sololatino.net/');
    })
    .then(function(sRes) {
        var matches = sRes.body.match(/href=["']https?:\/\/sololatino\.net\/[^"']+["']/gi) || [];
        var filtered = [];
        matches.forEach(function(m) {
            if (m.indexOf('/pelicula') !== -1 || m.indexOf('/serie') !== -1 || m.indexOf('/anime') !== -1) {
                if (filtered.indexOf(m) === -1) filtered.push(m);
            }
        });
        console.log('Enlaces de catálogo en SoloLatino:', filtered.slice(0, 12));
    })
    .catch(function(err) {
        console.log('Error:', err.message, err.cause || '');
    });
