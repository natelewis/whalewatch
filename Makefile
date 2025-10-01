# WhaleWatch Makefile
# Comprehensive build and development commands

.PHONY: help install server-dev dashboard-dev dev test test-server test-dashboard test-coverage lint lint-server lint-dashboard lint-feed tsc tsc-server tsc-dashboard clean build build-server build-dashboard start stop logs prettier install-feed ingest backfill-option-trades reset dev-feed clean-feed build-feed

# Default target
help:
	@echo "WhaleWatch - Available Commands:"
	@echo ""
	@echo "Development:"
	@echo "  make install          Install all dependencies"
	@echo "  make dev              Start both server and dashboard in development mode"
	@echo "  make server-dev       Start server in development mode"
	@echo "  make dashboard-dev    Start dashboard in development mode"
	@echo "  make dev-feed         Start feed service in development mode"
	@echo ""
	@echo "Testing:"
	@echo "  make test             Run all tests"
	@echo "  make test-server      Run server tests only"
	@echo "  make test-dashboard   Run dashboard tests only"
	@echo "  make test-feed        Run all feed tests"
	@echo "  make test-coverage    Run tests with coverage report"
	@echo ""
	@echo "Linting:"
	@echo "  make lint             Run linting for all projects"
	@echo "  make lint-server      Run server linting only"
	@echo "  make lint-dashboard   Run dashboard linting only"
	@echo "  make lint-feed        Run feed linting only"
	@echo ""
	@echo "TypeScript:"
	@echo "  make tsc              Run TypeScript compilation checks for all projects"
	@echo "  make tsc-server       Run TypeScript compilation check for server only"
	@echo "  make tsc-dashboard    Run TypeScript compilation check for dashboard only"
	@echo "  make tsc-feed         Run TypeScript compilation check for feed only"
	@echo ""
	@echo "Building:"
	@echo "  make build            Build all projects for production"
	@echo "  make build-server     Build server for production"
	@echo "  make build-dashboard  Build dashboard for production"
	@echo "  make build-feed       Build feed service for production"
	@echo ""
	@echo "Feed Service:"
	@echo "  make install-feed      Install feed service dependencies"
	@echo "  make ingest            Start real-time data ingestion"
	@echo "  make ingest-options    Start real-time option trade ingestion"
	@echo "  make backfill-option-trades  Download option trade data files (usage: make backfill-option-trades ARGS='2025-09-29')"
	@echo "  make reset             Reset all data in QuestDB (with confirmation)"
	@echo ""
	@echo "Utilities:"
	@echo "  make clean            Clean all build artifacts and node_modules"
	@echo "  make logs             Show logs from running processes"
	@echo "  make stop             Stop all running processes"
	@echo "  make prettier         Format code with Prettier"

# Install all dependencies
install:
	@echo "📦 Installing root dependencies..."
	npm install
	@echo "📦 Installing server dependencies..."
	cd server && npm install
	@echo "📦 Installing dashboard dependencies..."
	cd dashboard && npm install
	@echo "📦 Installing feed dependencies..."
	cd feed && npm install
	@echo "✅ All dependencies installed successfully!"

# Development commands
dev:
	@echo "🚀 Starting WhaleWatch in development mode..."
	@echo "🛑 Stopping any existing processes..."
	@pkill -f "tsx watch" || true
	@pkill -f "vite" || true
	@sleep 1
	npm run dev

server-dev:
	@echo "🖥️  Starting server in development mode..."
	@echo "🛑 Stopping any existing server processes..."
	@pkill -f "tsx watch src/index.ts" || true
	@sleep 1
	cd server && npm run dev

dashboard-dev:
	@echo "🎨 Starting dashboard in development mode..."
	cd dashboard && npm run dev

# Feed service commands
install-feed:
	@echo "📦 Installing feed service dependencies..."
	cd feed && npm install

dev-feed:
	@echo "📡 Starting feed service in development mode..."
	cd feed && npm run dev

ingest:
	@echo "📡 Starting real-time data ingestion..."
	cd feed && npm run ingest

ingest-options:
	@echo "📡 Starting real-time option trade ingestion..."
	cd feed && npm run ingest-options

# Backfill option trades data files
# Usage: make backfill-option-trades ARGS="2025-09-29"
backfill-option-trades:
	@echo "📊 Backfilling option trades data files..."
	@if [ -z "$(ARGS)" ]; then \
		echo "❌ Error: Please provide an end date in YYYY-MM-DD format"; \
		echo "Usage: make backfill-option-trades ARGS='2025-09-29'"; \
		exit 1; \
	fi
	cd feed && npm run backfill-option-trades -- $(ARGS)

# Reset all data (with confirmation)
reset:
	@echo "⚠️  This will delete ALL data in QuestDB. Are you sure? (y/N)"
	@read -r confirm && [ "$$confirm" = "y" ] || exit 1
	@echo "🗑️  Resetting all data..."
	cd feed && npm run reset

build-feed:
	@echo "🔨 Building feed service for production..."
	cd feed && npm run build

clean-feed:
	@echo "🧹 Cleaning feed service build artifacts..."
	rm -rf feed/dist
	rm -rf feed/node_modules

# Testing commands
test: test-server test-dashboard test-feed
	@echo "✅ All tests completed!"

test-force:
	@echo "🧪 Running server tests (ignoring failures)..."
	-cd server && npm run test:ci
	@echo "🧪 Running dashboard tests (ignoring failures)..."
	-cd dashboard && npm run test:ci
	@echo "✅ All tests completed (ignoring failures)!"

test-server:
	@echo "🧪 Running server tests..."
	cd server && npm run test:ci

test-dashboard:
	@echo "🧪 Running dashboard tests..."
	cd dashboard && npm run test:ci

test-feed:
	@echo "🧪 Running all feed tests..."
	cd feed && npm run test:ci

test-coverage:
	@echo "📊 Running tests with coverage..."
	@echo "Server coverage:"
	cd server && npm run test:coverage
	@echo "Dashboard coverage:"
	cd dashboard && npm run test:coverage
	@echo "Feed coverage:"
	cd feed && npm run test:coverage

# Linting commands
lint: lint-server lint-dashboard lint-feed
	@echo "✅ All linting completed!"

lint-server:
	@echo "🔍 Linting server code..."
	npx eslint server/src --ext .ts,.tsx --fix

lint-dashboard:
	@echo "🔍 Linting dashboard code..."
	npx eslint dashboard/src --ext .ts,.tsx --fix

lint-feed:
	@echo "🔍 Linting feed code..."
	npx eslint feed/src --ext .ts,.tsx --fix

# TypeScript compilation commands
tsc: tsc-server tsc-dashboard tsc-feed
	@echo "✅ All TypeScript compilation checks completed!"

tsc-server:
	@echo "🔍 Running TypeScript compilation check for server..."
	cd server && npx tsc --noEmit

tsc-dashboard:
	@echo "🔍 Running TypeScript compilation check for dashboard..."
	cd dashboard && npx tsc --noEmit

tsc-feed:
	@echo "🔍 Running TypeScript compilation check for feed..."
	cd feed && npx tsc --noEmit

# Building commands
build: build-server build-dashboard build-feed
	@echo "✅ All builds completed!"

build-server:
	@echo "🔨 Building server for production..."
	cd server && npm run build

build-dashboard:
	@echo "🔨 Building dashboard for production..."
	cd dashboard && npm run build

# Utility commands
clean:
	@echo "🧹 Cleaning build artifacts and dependencies..."
	rm -rf server/dist
	rm -rf server/node_modules
	rm -rf server/coverage
	rm -rf dashboard/dist
	rm -rf dashboard/node_modules
	rm -rf dashboard/coverage
	rm -rf feed/dist
	rm -rf feed/node_modules
	rm -rf node_modules
	@echo "✅ Cleanup completed!"

logs:
	@echo "📋 Recent logs:"
	@echo "Server logs:"
	@tail -n 20 server/logs/*.log 2>/dev/null || echo "No server logs found"
	@echo "Dashboard logs:"
	@tail -n 20 dashboard/logs/*.log 2>/dev/null || echo "No dashboard logs found"

stop:
	@echo "🛑 Stopping all WhaleWatch processes..."
	@pkill -f "whalewatch" || true
	@pkill -f "tsx watch" || true
	@pkill -f "vite" || true
	@echo "✅ All processes stopped!"

prettier:
	@echo "🎨 Formatting code with Prettier..."
	npx prettier . --write
	@echo "✅ Code formatting completed!"

# Development with logs
dev-with-logs: dev
	@echo "📋 Development started with log monitoring..."
	@make logs

# Quick setup for new developers
setup: install
	@echo "⚙️  Setting up development environment..."
	@echo "📝 Copying environment files..."
	cp server/env.example server/.env || echo "Server .env already exists"
	cp dashboard/env.example dashboard/.env || echo "Dashboard .env already exists"
	cp feed/env.example feed/.env || echo "Feed .env already exists"
	@echo "✅ Setup completed! Run 'make dev' to start development."

# Check if all required tools are installed
check-deps:
	@echo "🔍 Checking dependencies..."
	@command -v node >/dev/null 2>&1 || { echo "❌ Node.js is required but not installed."; exit 1; }
	@command -v npm >/dev/null 2>&1 || { echo "❌ npm is required but not installed."; exit 1; }
	@echo "✅ All required dependencies are installed!"

# Run specific test suites
test-server-watch:
	@echo "🧪 Running server tests in watch mode..."
	cd server && npm run test:watch

test-dashboard-watch:
	@echo "🧪 Running dashboard tests in watch mode..."
	cd dashboard && npm run test:watch

# Database and migration commands (if needed in future)
db-setup:
	@echo "🗄️  Setting up database..."
	@echo "No database setup required for current implementation"

# Docker commands (if needed in future)
docker-build:
	@echo "🐳 Building Docker images..."
	@echo "Docker support not implemented yet"

docker-run:
	@echo "🐳 Running with Docker..."
	@echo "Docker support not implemented yet"

# Production deployment
deploy:
	@echo "🚀 Deploying to production..."
	@echo "Production deployment not configured yet"

# Health check
health:
	@echo "🏥 Checking application health..."
	@curl -s http://localhost:3001/health || echo "❌ Server not responding"
	@curl -s http://localhost:5173 > /dev/null || echo "❌ Dashboard not responding"
	@echo "✅ Health check completed!"

# Show project status
status:
	@echo "📊 WhaleWatch Project Status:"
	@echo "================================"
	@echo "Node.js version: $(shell node --version 2>/dev/null || echo 'Not installed')"
	@echo "npm version: $(shell npm --version 2>/dev/null || echo 'Not installed')"
	@echo ""
	@echo "Server status:"
	@ps aux | grep -v grep | grep "tsx watch" | head -1 || echo "❌ Server not running"
	@echo ""
	@echo "Dashboard status:"
	@ps aux | grep -v grep | grep "vite" | head -1 || echo "❌ Dashboard not running"
	@echo ""
	@echo "Port usage:"
	@lsof -i :3001 2>/dev/null || echo "Port 3001: Available"
	@lsof -i :5173 2>/dev/null || echo "Port 5173: Available"
