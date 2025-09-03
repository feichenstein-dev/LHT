# Lashon Hara Texts

## Overview

This is a full-stack web application for sending daily inspirational SMS messages to subscribers. The app allows users to compose and send text messages to a list of subscribers via the Telnyx SMS API, track delivery status, and manage subscriber lists. Built with React frontend, Express.js backend, PostgreSQL database using Drizzle ORM, and styled with Tailwind CSS and shadcn/ui components.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript using Vite as the build tool
- **Routing**: Wouter for client-side routing with a simple tab-based navigation
- **UI Library**: shadcn/ui components built on Radix UI primitives with Tailwind CSS
- **State Management**: TanStack React Query for server state management, local React state for UI
- **Styling**: Tailwind CSS with CSS custom properties for theming, neutral color scheme

### Backend Architecture
- **Framework**: Express.js with TypeScript running on Node.js
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **API Design**: RESTful endpoints for messages, subscribers, and delivery logs
- **Middleware**: Request logging, JSON parsing, error handling middleware
- **Development**: Hot reload with Vite integration in development mode

### Database Schema
- **Messages Table**: Stores SMS message content with UUID primary keys and timestamps
- **Subscribers Table**: Manages phone numbers with status tracking (active/inactive)
- **Delivery Logs Table**: Tracks message delivery attempts with status, direction, and Telnyx integration

### Authentication & Authorization
- No authentication system implemented - this appears to be a single-user or internal application
- Database access secured through environment variables and connection pooling

## External Dependencies

### SMS Service Integration
- **Telnyx API**: Primary SMS gateway for sending messages with webhook support for delivery status updates
- Configuration through environment variables (TELNYX_API_KEY, TELNYX_PHONE_NUMBER)

### Database Services
- **PostgreSQL**: Primary database using connection string from DATABASE_URL environment variable
- **Neon Database**: Serverless PostgreSQL provider integration via @neondatabase/serverless

### Development & Deployment
- **Replit Integration**: Custom Vite plugins for development environment and error handling
- **Drizzle Kit**: Database migration and schema management tool
- **ESBuild**: Production build optimization for server-side code

### UI Component Libraries
- **Radix UI**: Comprehensive set of accessible component primitives
- **Lucide React**: Icon library for consistent iconography
- **TanStack React Query**: Server state synchronization and caching
- **React Hook Form**: Form validation and management with Zod schema validation