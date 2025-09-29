import uvicorn

def main():
    """Run the FastAPI application with uvicorn server"""
    print("Starting Movie Recommendation System API...")
    uvicorn.run(
        "app:app",  # Use import string for reload functionality
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )

if __name__ == "__main__":
    main()
