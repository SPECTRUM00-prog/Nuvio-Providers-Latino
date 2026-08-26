const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";

function resolveToTmdb(stremioId, type) {
    var isSeries = type === "series";
    var parts = stremioId.split(":");
    var rawId = parts[0];
    var season = isSeries && parts[1] ? parseInt(parts[1], 10) : null;
    var episode = isSeries && parts[2] ? parseInt(parts[2], 10) : null;

    // Si ya viene con prefijo tmdb:
    if (rawId.startsWith("tmdb:")) {
        return Promise.resolve({
            tmdbId: rawId.replace("tmdb:", ""),
            mediaType: isSeries ? "tv" : "movie",
            season: season,
            episode: episode
        });
    }

    // Si viene como IMDb (tt...)
    var findUrl = "https://api.themoviedb.org/3/find/" + rawId + "?api_key=" + TMDB_API_KEY + "&external_source=imdb_id";

    return fetch(findUrl)
        .then(function(res) { return res.json(); })
        .then(function(data) {
            var results = isSeries ? (data.tv_results || []) : (data.movie_results || []);
            if (results.length === 0) {
                // Si buscaba serie y no halló, probar si era película o viceversa
                results = (data.movie_results || []).concat(data.tv_results || []);
            }

            if (results.length > 0) {
                return {
                    tmdbId: results[0].id,
                    mediaType: isSeries ? "tv" : "movie",
                    season: season,
                    episode: episode
                };
            }
            return null;
        })
        .catch(function() { return null; });
}

module.exports = { resolveToTmdb };
