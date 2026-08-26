const { addonBuilder } = require("stremio-addon-sdk");
const { resolveToTmdb } = require("./helpers/tmdb.js");

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
    version: "1.0.2",
    name: "Spectrum Latino",
    description: "Películas, Series y Anime en Latino, Castellano y Sub Español en 1080p y 4K.",
    resources: ["stream"],
    types: ["movie", "series", "anime"],
    idPrefixes: ["tt", "tmdb:"],
    catalogs: []
};

const builder = new addonBuilder(manifest);

const DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const providers = [
    { name: "CineCalidad", mod: cinecalidad, isAnime: false },
    { name: "LaMovie",     mod: lamovie,     isAnime: false },
    { name: "SoloLatino",  mod: sololatino,  isAnime: false },
    { name: "HackStore",   mod: hackstore,   isAnime: false },
    { name: "PelisPlus",   mod: pelisplus,   isAnime: false },
    { name: "JKAnime",     mod: jkanime,     isAnime: true },
    { name: "AnimeAV1",    mod: animeav1,    isAnime: true },
    { name: "AnimeJara",   mod: animejara,   isAnime: true }
];

function timeoutPromise(ms) {
    return new Promise(function(resolve) {
        setTimeout(function() { resolve([]); }, ms);
    });
}

function getQualityWeight(quality) {
    var q = (quality || "").toLowerCase();
    if (q.indexOf("4k") !== -1 || q.indexOf("2160") !== -1) return 4;
    if (q.indexOf("1080") !== -1) return 3;
    if (q.indexOf("720") !== -1) return 2;
    if (q.indexOf("480") !== -1) return 1;
    return 0;
}

builder.defineStreamHandler(function(args) {
    var type = args.type;
    var id = args.id;

    return resolveToTmdb(id, type).then(function(target) {
        if (!target || !target.tmdbId) {
            return { streams: [] };
        }

        var isJapanese = target.originalLanguage === "ja";

        var activeProviders = providers.filter(function(p) {
            if (p.isAnime && !isJapanese) return false;
            return true;
        });

        var promises = activeProviders.map(function(p) {
            var scraperPromise = p.mod.getStreams(target.tmdbId, target.mediaType, target.season, target.episode)
                .catch(function() { return []; });

            return Promise.race([scraperPromise, timeoutPromise(4800)]).then(function(res) {
                var list = Array.isArray(res) ? res : [];
                return list.map(function(st) {
                    st._provider = p.name;
                    return st;
                });
            });
        });

        return Promise.all(promises).then(function(results) {
            var allStreams = [];

            for (var r = 0; r < results.length; r++) {
                var streamList = results[r];
                for (var s = 0; s < streamList.length; s++) {
                    var st = streamList[s];
                    if (st && st.url) {
                        var reqHeaders = st.headers || {};
                        if (!reqHeaders["User-Agent"]) reqHeaders["User-Agent"] = DEFAULT_UA;

                        allStreams.push({
                            name: `[${st._provider || "Latino"}]\n${st.quality || "1080p"}`,
                            title: `${st.title || st.name || "Servidor Directo"}\n⚡ ${st.quality || "HD"}`,
                            url: st.url,
                            quality: st.quality || "1080p",
                            behaviorHints: {
                                notWebReady: false,
                                proxyHeaders: {
                                    request: reqHeaders
                                }
                            }
                        });
                    }
                }
            }

            allStreams.sort(function(a, b) {
                return getQualityWeight(b.quality) - getQualityWeight(a.quality);
            });

            return { streams: allStreams };
        });
    }).catch(function() {
        return { streams: [] };
    });
});

module.exports = builder.getInterface();
