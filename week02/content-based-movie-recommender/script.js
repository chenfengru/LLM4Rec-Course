// Initialize the application when the window loads
window.onload = async function() {
    try {
        // Display loading message
        const resultElement = document.getElementById('result');
        resultElement.textContent = "Loading movie data...";
        resultElement.className = 'loading';
        
        // Load data
        await loadData();
        
        // Populate dropdown and update status
        populateMoviesDropdowns();
        synchronizeActiveMovieSelectors();
        resultElement.textContent = "Data loaded. Please select a movie.";
        resultElement.className = 'success';
    } catch (error) {
        console.error('Initialization error:', error);
        // Error message already set in data.js
    }
};

// Populate the movies dropdown with sorted movie titles
function populateMoviesDropdowns() {
    // Sort movies alphabetically by title
    const sortedMovies = [...movies].sort((a, b) => a.title.localeCompare(b.title));
    const selectIds = ['movie-select', 'profile-select-1', 'profile-select-2', 'profile-select-3'];

    selectIds.forEach(selectId => {
        const selectElement = document.getElementById(selectId);
        while (selectElement.options.length > 1) {
            selectElement.remove(1);
        }

        sortedMovies.forEach(movie => {
            const option = document.createElement('option');
            option.value = movie.id;
            option.textContent = movie.title;
            selectElement.appendChild(option);
        });
    });
}

// Keep the single active movie aligned with Movie 1 in the profile comparison
function synchronizeActiveMovieSelectors() {
    const activeMovieSelect = document.getElementById('movie-select');
    const profileMovieOneSelect = document.getElementById('profile-select-1');

    activeMovieSelect.addEventListener('change', () => {
        profileMovieOneSelect.value = activeMovieSelect.value;
    });
    profileMovieOneSelect.addEventListener('change', () => {
        activeMovieSelect.value = profileMovieOneSelect.value;
    });
}

// Calculate cosine similarity between two numeric feature vectors
function cosineSimilarity(vectorA, vectorB) {
    const dotProduct = vectorA.reduce(
        (sum, value, index) => sum + value * vectorB[index],
        0
    );
    const normA = Math.sqrt(vectorA.reduce((sum, value) => sum + value * value, 0));
    const normB = Math.sqrt(vectorB.reduce((sum, value) => sum + value * value, 0));

    return normA > 0 && normB > 0 ? dotProduct / (normA * normB) : 0;
}

// Score candidates and preserve source order when cosine scores tie
function rankMovies(queryVector, excludedMovieIds, vectorProperty = 'genreVector') {
    return movies
        .filter(movie => !excludedMovieIds.has(movie.id))
        .map(candidate => ({
            ...candidate,
            score: cosineSimilarity(queryVector, candidate[vectorProperty])
        }))
        .sort((a, b) => {
            const difference = b.score - a.score;
            return Math.abs(difference) > 1e-12 ? difference : 0;
        })
        .slice(0, 5);
}

function getFeatureMode() {
    const useIdf = document.getElementById('feature-mode').value === 'idf';
    return {
        label: useIdf ? 'Experimental IDF-weighted cosine' : 'Binary cosine',
        vectorProperty: useIdf ? 'weightedGenreVector' : 'genreVector'
    };
}

function formatRecommendations(recommendations) {
    return recommendations
        .map(movie => `${movie.title} (${movie.score.toFixed(3)})`)
        .join(', ');
}

// Main recommendation function
function getRecommendations() {
    const resultElement = document.getElementById('result');
    
    try {
        // Step 1: Get user input
        const selectElement = document.getElementById('movie-select');
        const selectedMovieId = parseInt(selectElement.value);
        
        if (isNaN(selectedMovieId)) {
            resultElement.textContent = "Please select a movie first.";
            resultElement.className = 'error';
            return;
        }
        
        // Step 2: Find the liked movie
        const likedMovie = movies.find(movie => movie.id === selectedMovieId);
        if (!likedMovie) {
            resultElement.textContent = "Error: Selected movie not found in database.";
            resultElement.className = 'error';
            return;
        }
        
        // Show loading message while processing
        resultElement.textContent = "Calculating recommendations...";
        resultElement.className = 'loading';
        
        // Use setTimeout to allow the UI to update before heavy computation
        setTimeout(() => {
            try {
                const featureMode = getFeatureMode();
                const topRecommendations = rankMovies(
                    likedMovie[featureMode.vectorProperty],
                    new Set([likedMovie.id]),
                    featureMode.vectorProperty
                );
                
                // Step 7: Display results
                if (topRecommendations.length > 0) {
                    resultElement.textContent = `${featureMode.label} — because you liked "${likedMovie.title}", we recommend: ${formatRecommendations(topRecommendations)}`;
                    resultElement.className = 'success';
                } else {
                    resultElement.textContent = `No recommendations found for "${likedMovie.title}".`;
                    resultElement.className = 'error';
                }
            } catch (error) {
                console.error('Error in recommendation calculation:', error);
                resultElement.textContent = "An error occurred while calculating recommendations.";
                resultElement.className = 'error';
            }
        }, 100);
    } catch (error) {
        console.error('Error in getRecommendations:', error);
        resultElement.textContent = "An unexpected error occurred.";
        resultElement.className = 'error';
    }
}

// Recommend from the element-wise average of exactly three watched movies
function getProfileRecommendations() {
    const resultElement = document.getElementById('profile-result');
    const selectedIds = [1, 2, 3].map(index =>
        parseInt(document.getElementById(`profile-select-${index}`).value)
    );

    if (selectedIds.some(id => isNaN(id)) || new Set(selectedIds).size !== 3) {
        resultElement.textContent = "Please select exactly three different watched movies.";
        resultElement.className = 'error';
        return;
    }

    const watchedMovies = selectedIds.map(id => movies.find(movie => movie.id === id));
    if (watchedMovies.some(movie => !movie)) {
        resultElement.textContent = "Error: A selected movie was not found.";
        resultElement.className = 'error';
        return;
    }

    const featureMode = getFeatureMode();
    const profileVector = genreNames.map((_, index) =>
        watchedMovies.reduce(
            (sum, movie) => sum + movie[featureMode.vectorProperty][index],
            0
        ) / 3
    );
    const topRecommendations = rankMovies(
        profileVector,
        new Set(selectedIds),
        featureMode.vectorProperty
    );

    resultElement.textContent = `${featureMode.label} — from your 3-movie profile, we recommend: ${formatRecommendations(topRecommendations)}`;
    resultElement.className = 'success';
}
