/**
 * Script de Inspección y Diagnóstico Profundo: Hackstore (Fase 8 - Identificación de Tab Series)
 * Ejecutar localmente con: node providers/inspect_hackstore.js
 */

var https = require('https');
var urlModule = require('url');

var BASE_URL = 'https://hackstore2.com';
var API_URL = BASE_URL + '/api/rest';
var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function getFile(url) {
    return new Promise(function(resolve, reject) {
        var parsed = urlModule.parse(url);
        https.get({
            hostname: parsed.hostname,
            path: parsed.path,
            headers: { 'User-Agent': USER_AGENT }
        }, function(res) {
            var chunks = [];
            res.on('data', function(c) { chunks.push(c); });
            res.on('end', function() {
                resolve(Buffer.concat(chunks).toString('utf8'));
            });
        }).on('error', reject);
    });
}

function requestJson(url) {
    return new Promise(function(resolve) {
        var parsed = urlModule.parse(url);
        https.get({
            hostname: parsed.hostname,
            path: parsed.path,
            headers: {
                'User-Agent': USER_AGENT,
                'Referer': BASE_URL + '/',
                'Accept': 'application/json'
            }
        }, function(res) {
            var chunks = [];
            res.on('data', function(c) { chunks.push(c); });
            res.on('end', function() {
                try {
                    resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
                } catch(e) {
                    resolve(null);
                }
            });
        }).on('error', function() { resolve(null); });
    });
}

function runPhase8() {
    var mainBundleUrl = 'https://hackstore2.com/wp-content/themes/hackstore/assets/build/assets/index-8f03e130.js';

    getFile(mainBundleUrl).then(function(code) {
        console.log('\n============================================================');
        console.log('>>> 1. BUSCANDO SETTERS DEL TAB EN EL BUSCADOR');
        console.log('============================================================');

        // Buscar dónde cambia de "movies"
        var idx = code.indexOf('useState("movies")');
        if (idx !== -1) {
            var snippet = code.substring(idx, Math.min(code.length, idx + 2500));
            // Buscar llamadas a la función que actualiza el estado (ej. i("..."))
            var matches = snippet.match(/onClick:[\s\S]{1,40}?\("([a-zA-Z0-9_-]+)"\)/g);
            console.log('Botones / Click Handlers encontrados cerca del estado:');
            console.log(matches);
            
            var allTypes = snippet.match(/"(movies|series|serie|tv|anime|episodes)"/g);
            console.log('Strings de tipos presentes en el modal de búsqueda:');
            console.log(allTypes);
        }

        console.log('\n============================================================');
        console.log('>>> 2. PROBANDO BÚSQUEDA DE SERIES CON TÍTULOS COMUNES');
        console.log('============================================================');
        
        // Probemos títulos conocidos con 'series'
        var testSeries = ['boys', 'dragon', 'halo', 'vikingos', 'walking'];
        
        function tryNextSerie(sIdx) {
            if (sIdx >= testSeries.length) return Promise.resolve();
            var q = testSeries[sIdx];
            var u = API_URL + '/search?post_type=series&query=' + q;
            return requestJson(u).then(function(res) {
                var posts = (res && res.data && res.data.posts) || [];
                console.log('Búsqueda: series | query=' + q + ' -> Encontrados: ' + posts.length);
                if (posts.length > 0) {
                    console.log('  -> ' + posts[0].title + ' (ID: ' + posts[0]._id + ')');
                    // Probar obtener episodios de esta serie
                    var epUrl = API_URL + '/episodes?post_id=' + posts[0]._id;
                    return requestJson(epUrl).then(function(epRes) {
                        var eps = (epRes && epRes.data) || [];
                        console.log('  -> [EPISODIOS DISPONIBLES]: ' + (Array.isArray(eps) ? eps.length : 'No array'));
                        if (Array.isArray(eps) && eps.length > 0) {
                            console.log('  -> Muestra Ep #1: S' + eps[0].season_number + 'E' + eps[0].episode_number + ' (ID: ' + eps[0]._id + ')');
                        }
                    });
                }
                return tryNextSerie(sIdx + 1);
            });
        }

        return tryNextSerie(0);
    }).catch(function(err) {
        console.log('Error:', err.message);
    });
}

runPhase8();
