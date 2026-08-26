const { addonBuilder } = require("stremio-addon-sdk");
const { resolveToTmdb } = require("./helpers/tmdb.js");

// Importar los 8 proveedores de Nuvio
const cinecalidad = require("./providers/cinecalidad.js");
const lamovie = require("./providers/lamovie.js");
const sololatino = require("./providers/sololatino.js");
const hackstore = require("./providers/hackstore.js");
const pelisplus = require("./providers/pelisplus.js");
const jkanime = require("./providers/jkanime.js");
const animeav1 = require("./providers/animeav1.js");
const animejara = require("./providers/animejara.js");

const manifest = {
    id: "org.spectrum.latino",
    version: "1.0.0",
    name: "Spectrum Latino",
    description: "Películas, Series y Anime en Latino, Castellano y Sub Español en 1080p y 4K.",
    resources: ["stream"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "tmdb:"],
    catalogs: []
};

const builder = new addonBuilder(manifest);

// Lista de proveedores activos
const providers = [
    { name: "CineCalidad", mod: cinecalidad },
    { name: "LaMovie", mod: lamovie },
    { name: "SoloLatino", mod: sololatino },
    { name: "HackStore", mod: hackstore },
    { name: "PelisPlus", mod: pelisplus },
    { name: "JKAnime", mod: jkanime },
    { name: "AnimeAV1", mod: animeav1 },
    { name: "AnimeJara", mod: animejara }
];

builder.defineStreamHandler(function(args) {
    var type = args.type;
    var id = args.id;

    console.log(`[Stremio] Petición de stream: Tipo = ${type}, ID = ${id}`);

    return resolveToTmdb(id, type).then(function(target) {
        if (!target || !target.tmdbId) {
            console.log("[Stremio] No se pudo resolver a TMDB ID");
            return { streams: [] };
        }

        console.log(`[Stremio] Resuelto a TMDB ID ${target.tmdbId} (${target.mediaType}) S:${target.season} E:${target.episode}`);

        // Ejecutar los 8 scrapers concurrentemente en paralelo
        var promises = providers.map(function(p) {
            return p.mod.getStreams(target.tmdbId, target.mediaType, target.season, target.episode)
                .catch(function(err) {
                    console.log(`[Stremio] Error en ${p.name}: ${err.message}`);
                    return [];
                });
        });

        return Promise.all(promises).then(function(results) {
            var allStreams = [];

            for (var r = 0; r < results.length; r++) {
                var streamList = results[r];
                if (Array.isArray(streamList)) {
                    for (var s = 0; s < streamList.length; s++) {
                        var st = streamList[s];
                        if (st && st.url) {
                            allStreams.push({
                                name: `[${st.name || "Latino"}]\n${st.quality || "1080p"}`,
                                title: `${st.title || st.name}\n🔗 Servidor Directo`,
                                url: st.url,
                                behaviorHints: {
                                    notWebReady: false,
                                    proxyHeaders: {
                                        request: st.headers || {} // Inyecta Referer y User-Agent en el reproductor de Stremio
                                    }
                                }
                            });
                        }
                    }
                }
            }

            console.log(`[Stremio] Entregando ${allStreams.length} stream(s) a Stremio`);
            return { streams: allStreams };
        });
    }).catch(function(err) {
        console.log(`[Stremio] Error general: ${err.message}`);
        return { streams: [] };
    });
});

module.exports = builder.getInterface();
