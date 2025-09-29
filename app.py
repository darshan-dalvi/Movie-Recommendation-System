from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import pickle
import pandas as pd
import numpy as np
import os
from pathlib import Path
import gc
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Movie Recommendation System",
    description="A FastAPI-based movie recommendation system with memory optimization",
    version="1.0.0"
)

# Add CORS middleware for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables for lazy loading
movies = None
similarity = None
movies_list = []
movies_df = None  # DataFrame with detailed movie information
_similarity_loaded = False

def load_movies_data():
    """Load movies data with error handling"""
    global movies, movies_list, movies_df
    
    try:
        movies_path = Path('models/movies_list.pkl')
        if not movies_path.exists():
            logger.error("Movies data file not found")
            return False
            
        with open(movies_path, 'rb') as f:
            movies = pickle.load(f)
            
        movies_list = movies['title'].values if hasattr(movies, 'title') else []
        
        # Load detailed movie data from CSV
        csv_path = Path('Movies_data.csv')
        if csv_path.exists():
            movies_df = pd.read_csv(csv_path)
            logger.info(f"Loaded detailed data for {len(movies_df)} movies from CSV")
        else:
            logger.warning("Movies_data.csv not found, detailed movie info will be limited")
            
        logger.info(f"Loaded {len(movies_list)} movies")
        return True
        
    except Exception as e:
        logger.error(f"Error loading movies data: {e}")
        movies = None
        movies_list = []
        movies_df = None
        return False

def load_similarity_matrix():
    """Lazy load similarity matrix only when needed"""
    global similarity, _similarity_loaded
    
    if _similarity_loaded and similarity is not None:
        return True
        
    try:
        similarity_path = Path('models/similarity.pkl')
        if not similarity_path.exists():
            logger.error("Similarity matrix file not found")
            return False
            
        # Check available memory before loading
        file_size = similarity_path.stat().st_size
        logger.info(f"Attempting to load similarity matrix ({file_size / (1024**2):.1f} MB)")
        
        # Load in chunks if possible, otherwise load normally
        try:
            with open(similarity_path, 'rb') as f:
                similarity = pickle.load(f)
            _similarity_loaded = True
            logger.info("Similarity matrix loaded successfully")
            return True
            
        except MemoryError:
            logger.error("Insufficient memory to load similarity matrix")
            # Try to use a smaller, pre-computed similarity approach
            return create_fallback_similarity()
            
    except Exception as e:
        logger.error(f"Error loading similarity matrix: {e}")
        return False

def create_fallback_similarity():
    """Create a fallback similarity calculation for memory-constrained environments"""
    global similarity, _similarity_loaded
    
    try:
        logger.info("Creating fallback similarity using movie features")
        
        # Create a simple similarity based on movie titles (as fallback)
        if movies is not None and len(movies_list) > 0:
            # Simple text-based similarity (very basic but memory efficient)
            similarity = create_simple_text_similarity()
            _similarity_loaded = True
            logger.info("Fallback similarity matrix created")
            return True
            
    except Exception as e:
        logger.error(f"Error creating fallback similarity: {e}")
        
    return False

def create_simple_text_similarity():
    """Create a simple text-based similarity matrix (memory efficient fallback)"""
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity
    
    try:
        # Use movie titles for basic similarity
        vectorizer = TfidfVectorizer(stop_words='english', max_features=1000)
        
        # Create feature matrix from movie titles
        title_features = vectorizer.fit_transform(movies_list)
        
        # Calculate similarity in chunks to manage memory
        n_movies = len(movies_list)
        chunk_size = min(1000, n_movies)
        
        # Initialize similarity matrix
        similarity_matrix = np.zeros((n_movies, n_movies), dtype=np.float32)
        
        for i in range(0, n_movies, chunk_size):
            end_i = min(i + chunk_size, n_movies)
            chunk_similarity = cosine_similarity(
                title_features[i:end_i], 
                title_features
            )
            similarity_matrix[i:end_i] = chunk_similarity.astype(np.float32)
            
            # Force garbage collection
            gc.collect()
            
        return similarity_matrix
        
    except Exception as e:
        logger.error(f"Error in simple similarity creation: {e}")
        # Return identity matrix as last resort
        n_movies = len(movies_list)
        return np.eye(n_movies, dtype=np.float32)

# Load movies data at startup (small file)
startup_success = load_movies_data()

# Pydantic models for request/response
class MovieRequest(BaseModel):
    movie_title: str

class MovieDetails(BaseModel):
    id: int
    title: str
    genre: str
    overview: str
    popularity: float
    release_date: str
    vote_average: float
    vote_count: int
    original_language: str

class RecommendationResponse(BaseModel):
    recommendations: List[str]
    message: str = "Success"

class MoviesListResponse(BaseModel):
    movies: List[str]
    total_count: int

class MovieDetailsResponse(BaseModel):
    movie: MovieDetails
    success: bool = True

def recommend(movie: str) -> List[str]:
    """Generate movie recommendations based on similarity"""
    if movies is None:
        raise HTTPException(status_code=500, detail="Movies data not loaded")
    
    # Lazy load similarity matrix when first recommendation is requested
    if not _similarity_loaded:
        logger.info("Loading similarity matrix for first recommendation...")
        if not load_similarity_matrix():
            raise HTTPException(
                status_code=500, 
                detail="Unable to load similarity data. Please check system memory."
            )
    
    if similarity is None:
        raise HTTPException(status_code=500, detail="Similarity matrix not available")
    
    try:
        # Find movie index
        if hasattr(movies, 'title'):
            movie_indices = movies[movies['title'] == movie].index
        else:
            # Fallback for different data structure
            movie_indices = [i for i, title in enumerate(movies_list) if title == movie]
        
        if len(movie_indices) == 0:
            raise HTTPException(status_code=404, detail="Movie not found")
            
        index = movie_indices[0]
        
        # Get similarity scores
        try:
            similarity_scores = similarity[index]
        except IndexError:
            raise HTTPException(status_code=500, detail="Invalid movie index")
        
        # Sort by similarity (excluding the movie itself)
        distance = sorted(
            list(enumerate(similarity_scores)), 
            reverse=True, 
            key=lambda vector: vector[1]
        )
        
        # Get top 5 recommendations (excluding the input movie)
        recommend_movie = []
        for i in distance[1:6]:  # Skip first one (itself)
            try:
                if hasattr(movies, 'loc'):
                    movie_title = movies.loc[i[0]]['title']
                else:
                    movie_title = movies_list[i[0]]
                recommend_movie.append(movie_title)
            except (IndexError, KeyError):
                continue
                
        if len(recommend_movie) == 0:
            raise HTTPException(status_code=404, detail="No recommendations found")
            
        return recommend_movie
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in recommend function: {e}")
        raise HTTPException(status_code=500, detail="Internal server error during recommendation")

@app.get("/", summary="Root endpoint")
async def root():
    """Welcome message for the Movie Recommendation System API"""
    return {
        "message": "Welcome to Movie Recommendation System API",
        "status": "running",
        "movies_loaded": len(movies_list) if movies_list else 0,
        "memory_optimized": True,
        "endpoints": {
            "GET /movies": "Get all available movies",
            "POST /recommend": "Get movie recommendations",
            "GET /health": "Check system status",
            "GET /docs": "API documentation"
        }
    }

@app.get("/movies", response_model=MoviesListResponse, summary="Get all movies")
async def get_movies():
    """Get list of all available movies"""
    if movies_list is None or (hasattr(movies_list, 'size') and movies_list.size == 0):
        if not load_movies_data():
            raise HTTPException(status_code=500, detail="Movies data not loaded")
    
    return MoviesListResponse(
        movies=movies_list.tolist() if hasattr(movies_list, 'tolist') else list(movies_list),
        total_count=len(movies_list)
    )

@app.post("/recommend", response_model=RecommendationResponse, summary="Get movie recommendations")
async def get_recommendations(request: MovieRequest):
    """Get movie recommendations based on the provided movie title"""
    if movies_list is None or (hasattr(movies_list, 'size') and movies_list.size == 0):
        if not load_movies_data():
            raise HTTPException(status_code=500, detail="Movies data not available")
    
    # Check if movie exists
    movie_exists = request.movie_title in movies_list
    if not movie_exists and hasattr(movies_list, 'tolist'):
        movie_exists = request.movie_title in movies_list.tolist()
    
    if not movie_exists:
        raise HTTPException(
            status_code=404, 
            detail=f"Movie '{request.movie_title}' not found in database"
        )
    
    try:
        recommendations = recommend(request.movie_title)
        return RecommendationResponse(recommendations=recommendations)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in get_recommendations: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/health", summary="Health check")
async def health_check():
    """Health check endpoint with detailed status"""
    return {
        "status": "healthy",
        "movies_loaded": movies_list is not None,
        "movies_count": len(movies_list) if movies_list is not None else 0,
        "similarity_loaded": _similarity_loaded,
        "memory_optimized": True,
        "startup_success": startup_success
    }

@app.get("/movie/{movie_title}", response_model=MovieDetailsResponse, summary="Get detailed movie information")
async def get_movie_details(movie_title: str):
    """Get comprehensive details for a specific movie"""
    if movies_df is None:
        if not load_movies_data():
            raise HTTPException(status_code=500, detail="Movie database not available")
    
    # Find movie in the dataframe
    movie_row = movies_df[movies_df['title'].str.lower() == movie_title.lower()]
    
    if movie_row.empty:
        raise HTTPException(status_code=404, detail=f"Movie '{movie_title}' not found")
    
    movie_data = movie_row.iloc[0]
    
    # Handle potential NaN values
    def safe_value(value, default="N/A"):
        if pd.isna(value):
            return default
        return value
    
    movie_details = MovieDetails(
        id=int(safe_value(movie_data['id'], 0)),
        title=safe_value(movie_data['title'], movie_title),
        genre=safe_value(movie_data['genre'], "Unknown"),
        overview=safe_value(movie_data['overview'], "No overview available."),
        popularity=float(safe_value(movie_data['popularity'], 0.0)),
        release_date=safe_value(movie_data['release_date'], "Unknown"),
        vote_average=float(safe_value(movie_data['vote_average'], 0.0)),
        vote_count=int(safe_value(movie_data['vote_count'], 0)),
        original_language=safe_value(movie_data['original_language'], "unknown")
    )
    
    return MovieDetailsResponse(movie=movie_details)

@app.get("/memory-status", summary="Memory status")
async def memory_status():
    """Get current memory status and model loading state"""
    import psutil
    import sys
    
    process = psutil.Process()
    memory_info = process.memory_info()
    
    return {
        "memory_usage_mb": round(memory_info.rss / 1024 / 1024, 2),
        "memory_percent": round(process.memory_percent(), 2),
        "similarity_loaded": _similarity_loaded,
        "movies_loaded": movies is not None,
        "movies_count": len(movies_list) if movies_list else 0,
        "python_version": sys.version,
        "recommendations_ready": _similarity_loaded and movies is not None
    }
    