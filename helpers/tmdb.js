const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";

function resolveToTmdb(stremioId, type) {
    var isSeries = type === "series";
    var parts = stremioId.split(":");
    var rawId = parts[0];
    var season = isSeries && parts[1] ? parseInt(parts[1], 10) : null;
    var episode = isSeries && parts[2] ? parseInt(parts[2], 10) : null;
    var mediaType = isSeries ? "tv" : "movie";

    // 1. Si ya viene con prefijo tmdb:
    if (rawId.startsWith("tmdb:")) {
        var tmdbId = rawId.replace("tmdb:", "");
        var detailUrl = "https://api.themoviedb.org/3/" + mediaType + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=es-MX";

        return fetch(detailUrl)
            .then(function(res) { return res.json(); })
            .then(function(data) {
                if (data && data.id) {
                    return {
                        tmdbId: data.id,
                        mediaType: mediaType,
                        season: season,
                        episode: episode,
                        originalLanguage: data.original_language || "",
                        title: data.title || data.name || "",
                        year: (data.release_date || data.first_air_date || "").slice(0, 4)
                    };
                }
                return {
                    tmdbId: tmdbId,
                    mediaType: mediaType,
                    season: season,
                    episode: episode,
                    originalLanguage: ""
                };
            })
            .catch(function() {
                return {
                    tmdbId: tmdbId,
                    mediaType: mediaType,
                    season: season,
                    episode: episode,
                    originalLanguage: ""
                };
            });
    }

    // 2. Si viene como IMDb (tt...)
    var findUrl = "https://api.themoviedb.org/3/find/" + rawId + "?api_key=" + TMDB_API_KEY + "&external_source=imdb_id";

    return fetch(findUrl)
        .then(function(res) { return res.json(); })
        .then(function(data) {
            var results = isSeries ? (data.tv_results || []) : (data.movie_results || []);
            if (results.length === 0) {
                // Fallback si el tipo de Stremio no coincidió exactamente
                results = (data.movie_results || []).concat(data.tv_results || []);
                if (results.length > 0 && data.tv_results && data.tv_results.length > 0) {
                    mediaType = "tv";
                }
            }

            if (results.length > 0) {
                var item = results[0];
                return {
                    tmdbId: item.id,
                    mediaType: mediaType,
                    season: season,
                    episode: episode,
                    originalLanguage: item.original_language || "",
                    title: item.title || item.name || "",
                    originalTitle: item.original_title || item.original_name || "",
                    year: (item.release_date || item.first_air_date || "").slice(0, 4)
                };
            }
            return null;
        })
        .catch(function() { return null; });
}

module.exports = { resolveToTmdb };
