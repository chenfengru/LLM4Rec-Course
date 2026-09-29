// Missing-value strategy: co-rated entries only. A zero marks an unrated
// user-movie pair, so it never contributes to the dot product or either norm.
// The co-rated count is diagnostic only; it does not weight the similarity.

// Initialize the application when the window loads
window.onload = async function() {
    const userBased = document.getElementById('user-based-result');
    const itemBased = document.getElementById('item-based-result');

    try {
        userBased.innerHTML = '<p>Loading movie data...</p>';
        itemBased.innerHTML = '<p>Loading movie data...</p>';

        await loadData();

        populateUserDropdown();
        document.getElementById('user-select').disabled = false;

        userBased.innerHTML = '<p>Data loaded. Select a user.</p>';
        itemBased.innerHTML = '<p>Data loaded. Select a user.</p>';
    } catch (error) {
        console.error('Initialization error:', error);
        // The error message is already shown by data.js
    }
};

// Populate the user dropdown with one option per user id found in u.data
function populateUserDropdown() {
    const selectElement = document.getElementById('user-select');

    // Clear existing options except the first placeholder
    while (selectElement.options.length > 1) {
        selectElement.remove(1);
    }

    for (let userId = 1; userId <= numUsers; userId++) {
        const option = document.createElement('option');
        option.value = userId;
        option.textContent = `User ${userId}`;
        selectElement.appendChild(option);
    }
}

// UI-only combobox state. Titles are displayed, but selection uses movie IDs.
let unseenMoviesForSelectedUser = [];
let matchingUnseenMovies = [];
let selectedMovieId = null;
let highlightedMovieIndex = -1;

function populateMovieDropdown(activeUserId) {
    const input = document.getElementById('movie-select');
    input.value = '';
    selectedMovieId = null;
    matchingUnseenMovies = [];
    document.getElementById('movie-options').replaceChildren();
    closeMovieDropdown();

    if (!Number.isInteger(activeUserId) || activeUserId < 1 || activeUserId > numUsers) {
        unseenMoviesForSelectedUser = [];
        input.disabled = true;
        return;
    }

    unseenMoviesForSelectedUser = movies
        .filter(movie => ratingMatrix[activeUserId][movie.id] === 0)
        .sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }) || a.id - b.id);
    input.disabled = false;
}

function renderMovieMatches(query) {
    const dropdown = document.getElementById('movie-options');
    const normalizedQuery = query.trim().toLocaleLowerCase('en');
    matchingUnseenMovies = unseenMoviesForSelectedUser.filter(movie =>
        movie.title.toLocaleLowerCase('en').includes(normalizedQuery)
    );
    highlightedMovieIndex = -1;
    document.getElementById('movie-select').removeAttribute('aria-activedescendant');

    const fragment = document.createDocumentFragment();
    if (matchingUnseenMovies.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'combo-empty';
        empty.textContent = 'No matching unseen movies';
        fragment.appendChild(empty);
    } else {
        for (const movie of matchingUnseenMovies) {
            const option = document.createElement('div');
            option.id = `movie-option-${movie.id}`;
            option.className = 'movie-option';
            option.setAttribute('role', 'option');
            option.setAttribute('aria-selected', String(movie.id === selectedMovieId));
            option.dataset.movieId = String(movie.id);
            option.textContent = movie.title;
            fragment.appendChild(option);
        }
    }
    dropdown.replaceChildren(fragment);
}

function openMovieDropdown() {
    const input = document.getElementById('movie-select');
    if (input.disabled) return;
    // A selected title stays visible while reopening the full unseen catalog.
    renderMovieMatches(selectedMovieId === null ? input.value : '');
    document.getElementById('movie-options').hidden = false;
    input.setAttribute('aria-expanded', 'true');
}

function closeMovieDropdown() {
    const input = document.getElementById('movie-select');
    document.getElementById('movie-options').hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    highlightedMovieIndex = -1;
}

function scheduleMovieDropdownClose() {
    setTimeout(() => {
        if (document.activeElement !== document.getElementById('movie-select')) {
            closeMovieDropdown();
        }
    }, 150);
}

function filterMovieDropdown() {
    const input = document.getElementById('movie-select');
    selectedMovieId = null;
    updateSelectedTargetBadges();
    renderMovieMatches(input.value);
    document.getElementById('movie-options').hidden = false;
    input.setAttribute('aria-expanded', 'true');
    clearPrediction();
}

function highlightMovieOption(index) {
    if (matchingUnseenMovies.length === 0) return;
    const dropdown = document.getElementById('movie-options');
    if (highlightedMovieIndex >= 0) {
        dropdown.children[highlightedMovieIndex].classList.remove('is-active');
    }
    highlightedMovieIndex = (index + matchingUnseenMovies.length) % matchingUnseenMovies.length;
    const option = dropdown.children[highlightedMovieIndex];
    option.classList.add('is-active');
    option.scrollIntoView({ block: 'nearest' });
    document.getElementById('movie-select').setAttribute('aria-activedescendant', option.id);
}

function selectMovie(movieId) {
    const movie = matchingUnseenMovies.find(item => item.id === movieId);
    if (!movie) return;
    selectedMovieId = movie.id;
    updateSelectedTargetBadges();
    const input = document.getElementById('movie-select');
    input.value = movie.title;
    input.focus();
    closeMovieDropdown();
    clearPrediction();
}

function selectMovieResult(event) {
    const option = event.target.closest('[data-movie-id]');
    if (option && document.getElementById('movie-options').contains(option)) {
        selectMovie(Number(option.dataset.movieId));
    }
}

function handleMovieComboKeydown(event) {
    const dropdown = document.getElementById('movie-options');
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (dropdown.hidden) openMovieDropdown();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const nextIndex = highlightedMovieIndex < 0
            ? (step > 0 ? 0 : matchingUnseenMovies.length - 1)
            : highlightedMovieIndex + step;
        highlightMovieOption(nextIndex);
    } else if (event.key === 'Enter' && !dropdown.hidden) {
        if (highlightedMovieIndex >= 0) {
            event.preventDefault();
            selectMovie(matchingUnseenMovies[highlightedMovieIndex].id);
        } else if (selectedMovieId === null) {
            event.preventDefault();
            document.getElementById('prediction-status').textContent = 'Please select a movie from the matching results.';
        }
    } else if (event.key === 'Escape' && !dropdown.hidden) {
        event.preventDefault();
        closeMovieDropdown();
    }
}

function clearPrediction() {
    document.getElementById('prediction-status').textContent = 'Select an unseen movie, then predict its rating.';
    document.getElementById('user-prediction-result').textContent = 'No prediction yet.';
    document.getElementById('item-prediction-result').textContent = 'No prediction yet.';
}

function handleUserChange() {
    const activeUserId = Number(document.getElementById('user-select').value);
    const validUser = Number.isInteger(activeUserId) && activeUserId >= 1 && activeUserId <= numUsers;
    populateMovieDropdown(validUser ? activeUserId : null);
    document.getElementById('predict-btn').disabled = !validUser;
    document.getElementById('recommend-btn').disabled = !validUser;
    clearPrediction();

    const info = document.getElementById('user-info');
    if (validUser) {
        const observedCount = ratingMatrix[activeUserId].filter(rating => rating !== 0).length;
        info.replaceChildren();
        for (const value of [
            `User ID: ${activeUserId}`,
            `Observed ratings: ${observedCount}`,
            'Missing values: Co-rated entries only'
        ]) {
            const item = document.createElement('span');
            item.textContent = value;
            info.appendChild(item);
        }
    } else {
        info.textContent = 'Select a user to see their rating history.';
    }

    renderList('user-based-result', [], validUser ? 'Click Get Top-5 Recommendations to compare methods.' : 'Select a user first.');
    renderList('item-based-result', [], validUser ? 'Click Get Top-5 Recommendations to compare methods.' : 'Select a user first.');
}

// Return the count as a separate diagnostic without changing the similarity API.
function cosineSimilarityDetails(a, b) {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    let coRatedCount = 0;

    for (let index = 0; index < a.length; index++) {
        if (a[index] === 0 || b[index] === 0) continue;

        dot += a[index] * b[index];
        normA += a[index] * a[index];
        normB += b[index] * b[index];
        coRatedCount++;
    }

    const denominator = Math.sqrt(normA * normB);
    return {
        similarity: coRatedCount > 0 && denominator > 0 ? dot / denominator : 0,
        coRatedCount
    };
}

function cosineSimilarity(a, b) {
    return cosineSimilarityDetails(a, b).similarity;
}

function getClosestNeighbors(activeUserId) {
    const activeRatings = ratingMatrix[activeUserId];
    const neighbors = [];

    for (let userId = 1; userId <= numUsers; userId++) {
        if (userId === activeUserId) continue;
        const similarity = cosineSimilarity(activeRatings, ratingMatrix[userId]);
        if (similarity > 0) neighbors.push({ userId, similarity });
    }

    neighbors.sort((a, b) => b.similarity - a.similarity || a.userId - b.userId);
    return neighbors.slice(0, 20);
}

// Shared by the selected-movie prediction and every recommendation candidate.
function predictUserBasedRating(activeUserId, movieId, closestNeighbors = getClosestNeighbors(activeUserId)) {
    let weightedRatings = 0;
    let similaritySum = 0;
    let supportCount = 0;
    for (const { userId, similarity } of closestNeighbors) {
        const rating = ratingMatrix[userId][movieId];
        if (rating === 0) continue;
        weightedRatings += similarity * rating;
        similaritySum += similarity;
        supportCount++;
    }
    return {
        score: similaritySum > 0 ? weightedRatings / similaritySum : null,
        supportCount
    };
}

function getUserBasedRecommendations(activeUserId, topK = 5) {
    const activeRatings = ratingMatrix[activeUserId];
    const closestNeighbors = getClosestNeighbors(activeUserId);
    const candidates = [];

    for (let movieId = 1; movieId <= numMovies; movieId++) {
        if (activeRatings[movieId] !== 0) continue;
        const prediction = predictUserBasedRating(activeUserId, movieId, closestNeighbors);
        if (prediction.score !== null) candidates.push({ movieId, ...prediction });
    }

    return topRecommendations(candidates, topK);
}

function getRatedMovieIds(activeUserId) {
    const activeRatings = ratingMatrix[activeUserId];
    const ratedMovieIds = [];
    for (let movieId = 1; movieId <= numMovies; movieId++) {
        if (activeRatings[movieId] !== 0) ratedMovieIds.push(movieId);
    }
    return ratedMovieIds;
}

function buildItemVectors() {
    // Transpose once so each cosine call receives an item rating column.
    return Array.from({ length: numMovies + 1 }, (_, movieId) =>
        ratingMatrix.map(userRatings => userRatings[movieId])
    );
}

// Shared by the selected-movie prediction and every recommendation candidate.
function predictItemBasedRating(activeUserId, movieId, itemVectors = buildItemVectors(), ratedMovieIds = getRatedMovieIds(activeUserId)) {
    const activeRatings = ratingMatrix[activeUserId];
    let weightedRatings = 0;
    let similaritySum = 0;
    let supportCount = 0;
    for (const ratedMovieId of ratedMovieIds) {
        const similarity = cosineSimilarity(itemVectors[movieId], itemVectors[ratedMovieId]);
        if (similarity <= 0) continue;
        weightedRatings += similarity * activeRatings[ratedMovieId];
        similaritySum += similarity;
        supportCount++;
    }
    return {
        score: similaritySum > 0 ? weightedRatings / similaritySum : null,
        supportCount
    };
}

function getItemBasedRecommendations(activeUserId, topK = 5) {
    const activeRatings = ratingMatrix[activeUserId];
    const ratedMovieIds = getRatedMovieIds(activeUserId);
    const itemVectors = buildItemVectors();
    const candidates = [];

    for (let movieId = 1; movieId <= numMovies; movieId++) {
        if (activeRatings[movieId] !== 0) continue;
        const prediction = predictItemBasedRating(activeUserId, movieId, itemVectors, ratedMovieIds);
        if (prediction.score !== null) candidates.push({ movieId, ...prediction });
    }

    return topRecommendations(candidates, topK);
}

// Keep movie IDs available to the UI without changing recommendation objects.
const recommendationMovieIds = new WeakMap();

function topRecommendations(candidates, topK) {
    candidates.sort((a, b) => b.score - a.score || a.movieId - b.movieId);
    const topCandidates = candidates.slice(0, topK);
    const recommendations = topCandidates.map(({ movieId, score, supportCount }) => ({
        title: movies[movieId - 1].title,
        score,
        supportCount
    }));
    recommendationMovieIds.set(recommendations, topCandidates.map(({ movieId }) => movieId));
    return recommendations;
}

function updateSelectedTargetBadges() {
    for (const elementId of ['user-based-result', 'item-based-result']) {
        const entries = document.getElementById(elementId).querySelectorAll('li[data-movie-id]');
        for (const entry of entries) {
            const title = entry.querySelector('.movie-title');
            const existingBadge = title.querySelector('.selected-target-badge');
            if (existingBadge) existingBadge.remove();
            if (selectedMovieId !== null && Number(entry.dataset.movieId) === selectedMovieId) {
                const badge = document.createElement('span');
                badge.className = 'selected-target-badge';
                badge.textContent = 'Selected target';
                title.appendChild(badge);
            }
        }
    }
}

function renderPrediction(elementId, prediction, supportLabel) {
    const target = document.getElementById(elementId);
    target.replaceChildren();
    if (prediction.score === null) {
        target.textContent = `No prediction: no positive-similarity support for this movie. ${prediction.supportCount} ${supportLabel}.`;
        return;
    }

    const score = document.createElement('strong');
    score.className = 'prediction-score';
    score.textContent = Number(prediction.score).toFixed(3);
    const support = document.createElement('span');
    support.className = 'support-count';
    support.textContent = `${prediction.supportCount} ${supportLabel}`;
    target.append(score, support);
}

function predictSelectedMovie() {
    const activeUserId = Number(document.getElementById('user-select').value);
    const movieId = selectedMovieId;
    const visibleTitle = document.getElementById('movie-select').value;
    const status = document.getElementById('prediction-status');

    if (!Number.isInteger(activeUserId) || activeUserId < 1 || activeUserId > numUsers) {
        status.textContent = 'Select a user first.';
        return;
    }
    if (!Number.isInteger(movieId) || movieId < 1 || movieId > numMovies ||
        visibleTitle !== movies[movieId - 1].title) {
        status.textContent = 'Please select a movie from the matching results.';
        return;
    }

    // This guard also handles a stale or programmatically selected rated movie.
    const observedRating = ratingMatrix[activeUserId][movieId];
    if (observedRating !== 0) {
        status.textContent = `${movies[movieId - 1].title}: observed rating ${observedRating}/5. Select an unseen movie for a prediction.`;
        document.getElementById('user-prediction-result').textContent = 'Not predicted: this rating is already observed.';
        document.getElementById('item-prediction-result').textContent = 'Not predicted: this rating is already observed.';
        return;
    }

    status.textContent = `Predicted rating for ${movies[movieId - 1].title}`;
    renderPrediction('user-prediction-result', predictUserBasedRating(activeUserId, movieId), 'of the top-20 similar users rated this movie');
    renderPrediction('item-prediction-result', predictItemBasedRating(activeUserId, movieId), 'previously rated movies had positive similarity');
}

// Read the selected user and render both recommendation lists.
function getRecommendations() {
    const selectElement = document.getElementById('user-select');
    const userId = Number(selectElement.value);

    if (!Number.isInteger(userId) || userId < 1 || userId > numUsers) {
        renderList('user-based-result', [], 'Please select a user first.');
        renderList('item-based-result', [], 'Please select a user first.');
        return;
    }

    renderList('user-based-result', getUserBasedRecommendations(userId), null, 'of the top-20 similar users rated this movie');
    renderList('item-based-result', getItemBasedRecommendations(userId), null, 'previously rated movies had positive similarity');
}

function renderList(elementId, items, message, supportLabel) {
    const el = document.getElementById(elementId);
    el.replaceChildren();

    if (message) {
        el.textContent = message;
        return;
    }

    if (!items || items.length === 0) {
        el.textContent = 'No recommendations have positive-similarity support.';
        return;
    }

    const list = document.createElement('ol');
    const movieIds = recommendationMovieIds.get(items) || [];
    for (const [index, item] of items.entries()) {
        const entry = document.createElement('li');
        if (movieIds[index] !== undefined) entry.dataset.movieId = String(movieIds[index]);
        const title = document.createElement('span');
        title.className = 'movie-title';
        title.textContent = item.title;
        const detail = document.createElement('span');
        detail.className = 'support-count';
        detail.textContent = `Predicted rating: ${Number(item.score).toFixed(3)} / 5 · ${item.supportCount} ${supportLabel}`;
        entry.append(title, detail);
        list.appendChild(entry);
    }
    el.appendChild(list);
    updateSelectedTargetBadges();
}
