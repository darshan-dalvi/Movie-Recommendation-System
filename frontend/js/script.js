// ========================================
// API Configuration
// ========================================
const API_BASE_URL = 'http://localhost:8000';
const TMDB_API_KEY = 'your_tmdb_api_key'; // Replace with actual TMDB API key
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

// ========================================
// State Management
// ========================================
let allMovies = [];
let currentRecommendations = [];
let searchTimeout = null;

// ========================================
// DOM Elements
// ========================================
const elements = {
    movieSearch: document.getElementById('movieSearch'),
    searchBtn: document.getElementById('searchBtn'),
    searchSuggestions: document.getElementById('searchSuggestions'),
    loadingAnimation: document.getElementById('loadingAnimation'),
    recommendationsGrid: document.getElementById('recommendationsGrid'),
    featuredMovies: document.getElementById('featuredMovies'),
    noResults: document.getElementById('noResults'),
    totalMovies: document.getElementById('totalMovies'),
    toastContainer: document.getElementById('toastContainer')
};

// ========================================
// Utility Functions
// ========================================
class Utils {
    static async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    static debounce(func, delay) {
        let timeoutId;
        return function (...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }

    static sanitizeString(str) {
        return str.replace(/[^\w\s]/gi, '').trim();
    }

    static truncateText(text, maxLength) {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    static generateRandomRating() {
        return (Math.random() * (9.0 - 6.0) + 6.0).toFixed(1);
    }

    static generateRandomYear() {
        const currentYear = new Date().getFullYear();
        return Math.floor(Math.random() * (currentYear - 1990) + 1990);
    }

    static getGenres() {
        const genres = [
            'Action', 'Adventure', 'Comedy', 'Drama', 'Horror', 
            'Romance', 'Sci-Fi', 'Thriller', 'Fantasy', 'Mystery',
            'Crime', 'Animation', 'Family', 'War', 'Western'
        ];
        const count = Math.floor(Math.random() * 3) + 1;
        const shuffled = [...genres].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, count);
    }
}

// ========================================
// Toast Notification System
// ========================================
class ToastManager {
    static show(message, type = 'success', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icon = this.getIcon(type);
        toast.innerHTML = `
            <i class="${icon}"></i>
            <span>${message}</span>
        `;
        
        elements.toastContainer.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideIn 0.3s ease-out reverse';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
    
    static getIcon(type) {
        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle'
        };
        return icons[type] || icons.info;
    }
}

// ========================================
// API Service
// ========================================
class APIService {
    static async fetchMovies() {
        try {
            const response = await fetch(`${API_BASE_URL}/movies`);
            if (!response.ok) throw new Error('Failed to fetch movies');
            const data = await response.json();
            return data.movies || [];
        } catch (error) {
            console.error('Error fetching movies:', error);
            ToastManager.show('Failed to load movies', 'error');
            return [];
        }
    }
    
    static async getRecommendations(movieTitle) {
        try {
            const response = await fetch(`${API_BASE_URL}/recommend`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ movie_title: movieTitle })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to get recommendations');
            }
            
            const data = await response.json();
            return data.recommendations || [];
        } catch (error) {
            console.error('Error getting recommendations:', error);
            ToastManager.show(error.message, 'error');
            return [];
        }
    }
    
    static async getMovieDetails(movieTitle) {
        try {
            const response = await fetch(`${API_BASE_URL}/movie/${encodeURIComponent(movieTitle)}`);
            
            if (!response.ok) {
                if (response.status === 404) {
                    return null; // Movie not found, return null gracefully
                }
                throw new Error('Failed to get movie details');
            }
            
            const data = await response.json();
            return data.movie || null;
        } catch (error) {
            console.error('Error getting movie details:', error);
            return null;
        }
    }
    
    static async searchTMDBMovie(title) {
        try {
            if (!TMDB_API_KEY || TMDB_API_KEY === 'your_tmdb_api_key') {
                return null; // Skip TMDB if no API key
            }
            
            const response = await fetch(
                `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}`
            );
            
            if (!response.ok) return null;
            
            const data = await response.json();
            return data.results && data.results.length > 0 ? data.results[0] : null;
        } catch (error) {
            console.error('TMDB API error:', error);
            return null;
        }
    }
}

// ========================================
// Movie Card Component
// ========================================
class MovieCard {
    static create(movieTitle, movieData = null) {
        const card = document.createElement('div');
        card.className = 'movie-card';
        card.setAttribute('data-movie-title', movieTitle);
        
        const posterUrl = movieData?.poster_path 
            ? `${TMDB_IMAGE_BASE}${movieData.poster_path}`
            : null;
            
        const year = movieData?.release_date 
            ? new Date(movieData.release_date).getFullYear()
            : Utils.generateRandomYear();
            
        const rating = movieData?.vote_average 
            ? movieData.vote_average.toFixed(1)
            : Utils.generateRandomRating();
            
        const genres = movieData?.genre_ids 
            ? this.getGenreNames(movieData.genre_ids)
            : Utils.getGenres();
        
        card.innerHTML = `
            <div class="movie-card-inner">
                <!-- Front Face -->
                <div class="movie-card-front">
                    <div class="movie-poster">
                        ${posterUrl 
                            ? `<img src="${posterUrl}" alt="${movieTitle}" loading="lazy">` 
                            : `<i class="fas fa-film fallback-icon"></i>`
                        }
                    </div>
                    <h3 class="movie-title">${Utils.truncateText(movieTitle, 30)}</h3>
                    <div class="movie-year">${year}</div>
                    <div class="movie-rating">
                        <span class="rating-stars">
                            ${this.generateStars(rating)}
                        </span>
                        <span class="rating-value">${rating}</span>
                    </div>
                    <div class="movie-genres">
                        ${genres.map(genre => `<span class="genre-tag">${genre}</span>`).join('')}
                    </div>
                    <div class="movie-actions">
                        <button class="action-btn recommend-btn" onclick="MovieManager.getRecommendations('${movieTitle.replace(/'/g, "\\'")}')">
                            <i class="fas fa-magic"></i>
                            Recommend
                        </button>
                    </div>
                </div>
                
                <!-- Back Face with Movie Details -->
                <div class="movie-card-back" id="details-${movieTitle.replace(/[^a-zA-Z0-9]/g, '')}">
                    <div class="movie-detail-loading">
                        <i class="fas fa-spinner"></i>
                        Loading details...
                    </div>
                </div>
            </div>
        `;
        
        // Add hover events for detailed information
        let hoverTimeout;
        const backFace = card.querySelector('.movie-card-back');
        
        card.addEventListener('mouseenter', () => {
            hoverTimeout = setTimeout(async () => {
                await this.loadMovieDetails(movieTitle, backFace);
            }, 200); // Shorter delay for better UX
        });
        
        card.addEventListener('mouseleave', () => {
            clearTimeout(hoverTimeout);
        });
        
        // Add click event for card interaction
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.action-btn')) {
                card.style.transform = 'scale(0.98)';
                setTimeout(() => {
                    card.style.transform = '';
                }, 150);
            }
        });
        
        return card;
    }
    
    static async loadMovieDetails(movieTitle, backFace) {
        if (backFace.dataset.loaded === 'true') {
            return; // Already loaded
        }
        
        try {
            const movieDetails = await APIService.getMovieDetails(movieTitle);
            
            if (movieDetails) {
                backFace.innerHTML = this.createDetailedView(movieDetails);
                backFace.dataset.loaded = 'true';
            } else {
                backFace.innerHTML = this.createNoDetailsView(movieTitle);
                backFace.dataset.loaded = 'true';
            }
        } catch (error) {
            console.error('Error loading movie details:', error);
            backFace.innerHTML = this.createErrorView();
        }
    }
    
    static createDetailedView(movie) {
        const genres = movie.genre ? movie.genre.split(',').map(g => g.trim()) : [];
        const releaseYear = movie.release_date ? new Date(movie.release_date).getFullYear() : 'Unknown';
        const formattedPopularity = movie.popularity ? movie.popularity.toFixed(1) : '0.0';
        
        return `
            <div class="movie-details-content">
                <div class="movie-detail-header">
                    <div class="movie-detail-poster">
                        <i class="fas fa-film"></i>
                    </div>
                    <div class="movie-detail-info">
                        <div class="movie-detail-title">${Utils.truncateText(movie.title, 35)}</div>
                        <div class="movie-detail-meta">
                            <div class="movie-detail-rating">
                                <i class="fas fa-star"></i>
                                <span>${movie.vote_average}/10</span>
                            </div>
                            <div class="movie-detail-year">${releaseYear}</div>
                            <div class="movie-detail-language">${movie.original_language.toUpperCase()}</div>
                        </div>
                    </div>
                </div>
                
                <div class="movie-detail-overview">
                    ${Utils.truncateText(movie.overview || 'No overview available.', 300)}
                </div>
                
                ${genres.length > 0 ? `
                    <div class="movie-detail-genres">
                        ${genres.slice(0, 3).map(genre => `<span class="movie-detail-genre">${genre}</span>`).join('')}
                    </div>
                ` : ''}
                
                <div class="movie-detail-stats">
                    <div class="movie-detail-stat">
                        <div class="movie-detail-stat-value">${movie.vote_count.toLocaleString()}</div>
                        <div class="movie-detail-stat-label">Votes</div>
                    </div>
                    <div class="movie-detail-stat">
                        <div class="movie-detail-stat-value">${formattedPopularity}</div>
                        <div class="movie-detail-stat-label">Popularity</div>
                    </div>
                </div>
            </div>
        `;
    }
    
    static createNoDetailsView(movieTitle) {
        return `
            <div class="movie-details-content">
                <div class="movie-detail-header">
                    <div class="movie-detail-poster">
                        <i class="fas fa-film"></i>
                    </div>
                    <div class="movie-detail-info">
                        <div class="movie-detail-title">${Utils.truncateText(movieTitle, 35)}</div>
                        <div class="movie-detail-meta">
                            <span style="color: var(--text-muted);">Limited information available</span>
                        </div>
                    </div>
                </div>
                
                <div class="movie-detail-overview">
                    Detailed information for this movie is not available in our database. Try searching for recommendations instead!
                </div>
                
                <div class="movie-detail-stats">
                    <div class="movie-detail-stat">
                        <div class="movie-detail-stat-value">-</div>
                        <div class="movie-detail-stat-label">Rating</div>
                    </div>
                    <div class="movie-detail-stat">
                        <div class="movie-detail-stat-value">-</div>
                        <div class="movie-detail-stat-label">Votes</div>
                    </div>
                </div>
            </div>
        `;
    }
    
    static createErrorView() {
        return `
            <div class="movie-details-content">
                <div class="movie-detail-loading" style="color: #ef4444;">
                    <i class="fas fa-exclamation-triangle"></i>
                    Failed to load movie details
                </div>
            </div>
        `;
    }
    
    static generateStars(rating) {
        const stars = Math.round(rating / 2);
        let starsHtml = '';
        
        for (let i = 1; i <= 5; i++) {
            if (i <= stars) {
                starsHtml += '<i class="fas fa-star"></i>';
            } else {
                starsHtml += '<i class="far fa-star"></i>';
            }
        }
        
        return starsHtml;
    }
    
    static getGenreNames(genreIds) {
        const genreMap = {
            28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
            80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
            14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
            9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 10770: 'TV Movie',
            53: 'Thriller', 10752: 'War', 37: 'Western'
        };
        
        return genreIds.slice(0, 3).map(id => genreMap[id] || 'Unknown').filter(Boolean);
    }
}

// ========================================
// Movie Manager
// ========================================
class MovieManager {
    static async initialize() {
        await this.loadMovies();
        this.setupEventListeners();
        this.loadFeaturedMovies();
        this.updateStats();
    }
    
    static async loadMovies() {
        try {
            allMovies = await APIService.fetchMovies();
            console.log(`Loaded ${allMovies.length} movies`);
        } catch (error) {
            console.error('Failed to load movies:', error);
            ToastManager.show('Failed to load movie database', 'error');
        }
    }
    
    static setupEventListeners() {
        // Search input with debounced suggestions
        elements.movieSearch.addEventListener('input', 
            Utils.debounce((e) => this.handleSearchInput(e.target.value), 300)
        );
        
        // Search button
        elements.searchBtn.addEventListener('click', () => {
            const query = elements.movieSearch.value.trim();
            if (query) {
                this.getRecommendations(query);
            } else {
                ToastManager.show('Please enter a movie title', 'warning');
            }
        });
        
        // Enter key on search input
        elements.movieSearch.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                elements.searchBtn.click();
            }
        });
        
        // Click outside to close suggestions
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-container')) {
                this.hideSuggestions();
            }
        });
        
        // Smooth scrolling for navigation links
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = link.getAttribute('href');
                const targetElement = document.querySelector(targetId);
                if (targetElement) {
                    targetElement.scrollIntoView({ behavior: 'smooth' });
                }
            });
        });
    }
    
    static handleSearchInput(query) {
        if (query.length < 2) {
            this.hideSuggestions();
            return;
        }
        
        const suggestions = this.getSuggestions(query);
        this.showSuggestions(suggestions);
    }
    
    static getSuggestions(query) {
        const normalizedQuery = query.toLowerCase();
        return allMovies
            .filter(movie => movie.toLowerCase().includes(normalizedQuery))
            .slice(0, 8)
            .sort((a, b) => {
                const aIndex = a.toLowerCase().indexOf(normalizedQuery);
                const bIndex = b.toLowerCase().indexOf(normalizedQuery);
                return aIndex - bIndex;
            });
    }
    
    static showSuggestions(suggestions) {
        if (suggestions.length === 0) {
            this.hideSuggestions();
            return;
        }
        
        elements.searchSuggestions.innerHTML = suggestions
            .map(movie => `
                <div class="suggestion-item" onclick="MovieManager.selectSuggestion('${movie.replace(/'/g, "\\'")}')">
                    <i class="fas fa-film"></i> ${movie}
                </div>
            `).join('');
            
        elements.searchSuggestions.classList.remove('hidden');
    }
    
    static hideSuggestions() {
        elements.searchSuggestions.classList.add('hidden');
    }
    
    static selectSuggestion(movie) {
        elements.movieSearch.value = movie;
        this.hideSuggestions();
        this.getRecommendations(movie);
    }
    
    static async getRecommendations(movieTitle) {
        // Validate movie exists
        if (!allMovies.includes(movieTitle)) {
            ToastManager.show('Movie not found in database', 'error');
            return;
        }
        
        // Show loading
        this.showLoading();
        this.hideSuggestions();
        
        try {
            // Get recommendations from API
            const recommendations = await APIService.getRecommendations(movieTitle);
            
            if (recommendations.length === 0) {
                this.showNoResults();
                return;
            }
            
            // Store current recommendations
            currentRecommendations = recommendations;
            
            // Render recommendations with enhanced data
            await this.renderRecommendations(recommendations);
            
            // Scroll to recommendations
            document.getElementById('recommendations').scrollIntoView({ 
                behavior: 'smooth',
                block: 'start'
            });
            
            ToastManager.show(`Found ${recommendations.length} recommendations for "${movieTitle}"`, 'success');
            
        } catch (error) {
            console.error('Error getting recommendations:', error);
            this.showNoResults();
        }
    }
    
    static async renderRecommendations(movies) {
        elements.recommendationsGrid.innerHTML = '';
        
        // Create cards with enhanced data
        const cardPromises = movies.map(async (movie) => {
            const tmdbData = await APIService.searchTMDBMovie(movie);
            return MovieCard.create(movie, tmdbData);
        });
        
        const cards = await Promise.all(cardPromises);
        
        // Add cards with stagger animation
        cards.forEach((card, index) => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';
            elements.recommendationsGrid.appendChild(card);
            
            setTimeout(() => {
                card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            }, index * 100);
        });
        
        this.hideLoading();
        elements.recommendationsGrid.classList.remove('hidden');
        elements.noResults.classList.add('hidden');
    }
    
    static loadFeaturedMovies() {
        if (allMovies.length === 0) return;
        
        // Get random featured movies
        const featuredCount = 6;
        const shuffled = [...allMovies].sort(() => 0.5 - Math.random());
        const featured = shuffled.slice(0, featuredCount);
        
        // Create featured movie cards
        featured.forEach(async (movie) => {
            const tmdbData = await APIService.searchTMDBMovie(movie);
            const card = MovieCard.create(movie, tmdbData);
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';
            elements.featuredMovies.appendChild(card);
            
            setTimeout(() => {
                card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            }, Math.random() * 500);
        });
    }
    
    static showLoading() {
        elements.loadingAnimation.classList.remove('hidden');
        elements.recommendationsGrid.classList.add('hidden');
        elements.noResults.classList.add('hidden');
    }
    
    static hideLoading() {
        elements.loadingAnimation.classList.add('hidden');
    }
    
    static showNoResults() {
        elements.loadingAnimation.classList.add('hidden');
        elements.recommendationsGrid.classList.add('hidden');
        elements.noResults.classList.remove('hidden');
    }
    
    static updateStats() {
        if (elements.totalMovies && allMovies.length > 0) {
            // Animate number counting
            let current = 0;
            const target = allMovies.length;
            const increment = Math.ceil(target / 50);
            
            const timer = setInterval(() => {
                current += increment;
                if (current >= target) {
                    current = target;
                    clearInterval(timer);
                }
                elements.totalMovies.textContent = current.toLocaleString();
            }, 30);
        }
    }
}

// ========================================
// Theme Manager
// ========================================
class ThemeManager {
    static applyDynamicColors() {
        const colors = [
            'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
            'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
            'linear-gradient(135deg, #fa709a 0%, #fee140 100%)'
        ];
        
        const shapes = document.querySelectorAll('.shape');
        shapes.forEach((shape, index) => {
            shape.style.background = colors[index % colors.length];
        });
    }
}

// ========================================
// Performance Optimization
// ========================================
class PerformanceOptimizer {
    static lazyLoadImages() {
        const images = document.querySelectorAll('img[loading="lazy"]');
        
        if ('IntersectionObserver' in window) {
            const imageObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        img.src = img.dataset.src || img.src;
                        img.classList.remove('lazy');
                        observer.unobserve(img);
                    }
                });
            });
            
            images.forEach(img => imageObserver.observe(img));
        }
    }
    
    static prefetchCriticalResources() {
        // Prefetch commonly used movie data
        if (allMovies.length > 0) {
            const popularMovies = allMovies.slice(0, 10);
            popularMovies.forEach(movie => {
                // Prefetch TMDB data for popular movies
                APIService.searchTMDBMovie(movie).catch(() => {});
            });
        }
    }
}

// ========================================
// Animation Controller
// ========================================
class AnimationController {
    static initializeAnimations() {
        // Animate on scroll
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animate-in');
                }
            });
        }, observerOptions);
        
        // Observe elements for animation
        document.querySelectorAll('.movie-card, .stat-item, .section-header').forEach(el => {
            observer.observe(el);
        });
    }
    
    static addParallaxEffect() {
        window.addEventListener('scroll', () => {
            const scrolled = window.pageYOffset;
            const parallaxElements = document.querySelectorAll('.floating-shapes');
            
            parallaxElements.forEach((element, index) => {
                const speed = 0.5 + (index * 0.1);
                element.style.transform = `translateY(${scrolled * speed}px)`;
            });
        });
    }
}

// ========================================
// Application Initialization
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Show loading indicator
        console.log('🎬 Initializing Movie Recommendation System...');
        
        // Initialize core functionality
        await MovieManager.initialize();
        
        // Initialize additional features
        ThemeManager.applyDynamicColors();
        AnimationController.initializeAnimations();
        AnimationController.addParallaxEffect();
        PerformanceOptimizer.lazyLoadImages();
        
        // Prefetch data for better performance
        setTimeout(() => {
            PerformanceOptimizer.prefetchCriticalResources();
        }, 2000);
        
        console.log('✅ Application initialized successfully!');
        ToastManager.show('Welcome to MovieRec! Start by searching for a movie.', 'info', 4000);
        
    } catch (error) {
        console.error('❌ Application initialization failed:', error);
        ToastManager.show('Failed to initialize application', 'error');
    }
});

// ========================================
// Error Handling
// ========================================
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    ToastManager.show('An unexpected error occurred', 'error');
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    ToastManager.show('Network error occurred', 'error');
});

// ========================================
// Export for testing (if needed)
// ========================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        MovieManager,
        APIService,
        MovieCard,
        ToastManager,
        Utils
    };
}