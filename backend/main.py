"""
Offline Election System - Main Application
Scalable offline voting system for universities
"""

import os
import uvicorn
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import Settings
from app.core.database import get_db
from app.api.electorate_router import router as electorate_router
from app.api.auth_router import router as auth_router
from app.api.voting_router import router as voting_router
from app.api.portfolio_router import router as portfolio_router
from app.api.admin_router import router as admin_router
from app.api.results_router import router as results_router
from app.api.candidate_routes import router as candidate_router

settings = Settings()

# Create FastAPI application
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description=settings.DESCRIPTION,
    debug=settings.DEBUG,
    openapi_url="/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Register routers with API prefix
app.include_router(admin_router, prefix=settings.API_PREFIX)
app.include_router(candidate_router, prefix=settings.API_PREFIX)
app.include_router(portfolio_router, prefix=settings.API_PREFIX)
app.include_router(electorate_router, prefix=settings.API_PREFIX)
app.include_router(auth_router, prefix=settings.API_PREFIX)
app.include_router(voting_router, prefix=settings.API_PREFIX)
app.include_router(results_router, prefix=settings.API_PREFIX)

# CORS middleware for local network access
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://192.168.*:3000",  # Local network
    "http://10.0.*:3000",     # Local network
    "https://kratos-ui.vercel.app",
    "https://*.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Setup upload directories
UPLOAD_DIR = "uploads"
CANDIDATE_UPLOAD_DIR = os.path.join(UPLOAD_DIR, "candidates")
os.makedirs(CANDIDATE_UPLOAD_DIR, exist_ok=True)

# Mount static files for serving uploaded images
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": f"Welcome to {settings.APP_NAME}",
        "version": settings.VERSION,
        "status": "online",
        "mode": "offline",
    }


@app.get(f"{settings.API_PREFIX}/healthcheck")
async def api_healthcheck():
    """Health check endpoint for monitoring"""
    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "version": settings.VERSION,
        "mode": "offline",
    }


@app.get("/healthcheck")
async def healthcheck(db=Depends(get_db)):
    """Database health check endpoint"""
    return {
        "status": "ok",
        "database": "connected",
        "mode": "offline",
    }


# Startup event
@app.on_event("startup")
async def startup_event():
    """Application startup event"""
    import logging
    
    logger = logging.getLogger(__name__)
    logger.info(f"Starting {settings.APP_NAME} v{settings.VERSION}")
    logger.info(f"Environment: {settings.ENVIRONMENT}")
    logger.info(f"Mode: Offline")
    logger.info(f"Workers: {settings.WORKERS}")


# Shutdown event
@app.on_event("shutdown")
async def shutdown_event():
    """Application shutdown event"""
    import logging
    
    logger = logging.getLogger(__name__)
    logger.info(f"Shutting down {settings.APP_NAME}")


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.RELOAD,
        workers=settings.WORKERS,
    )