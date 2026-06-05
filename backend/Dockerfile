FROM python:3.10

WORKDIR /app

# Install system dependencies first (rarely change)
RUN apt-get update && apt-get install -y \
    fontconfig \
    fonts-dejavu \
    libreoffice \
    mediainfo \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements.txt and install Python dependencies (change occasionally)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code last (changes every commit)
COPY . .

# Add non-root user(Debian/Ubuntu)
RUN adduser --disabled-password --gecos "" appuser
# Create static directory for Django static files
RUN mkdir -p /app/static
RUN chown -R appuser:appuser /app
# Make entrypoint script executable
RUN chmod +x /app/entrypoint
USER appuser

CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "backend.asgi:application"]
