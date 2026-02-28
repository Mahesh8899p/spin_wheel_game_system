# Real-Time Spin Wheel System

A real-time multiplayer spin wheel game system built with **React, Node.js, PostgreSQL, WebSockets, and Docker**.

---

## Features

- Admin can create a spin wheel
- Users join by paying entry fee
- Real-time elimination every 7 seconds
- Automatic start after 3 minutes
- Winner gets prize pool
- Transaction-safe coin system
- WebSocket-based live updates
- Dockerized setup

---

## Tech Stack

- Frontend: React + TypeScript
- Backend: Express + TypeScript
- Database: PostgreSQL
- Realtime: WebSockets (ws)
- Deployment: Docker + Docker Compose

---

### Setup Instructions

### 1. Clone repo

git clone <repo_url>
cd spin-wheel

## Run using Docker
docker-compose up --build

Architecture
REST APIs for game lifecycle
WebSocket for real-time updates
Worker loop for elimination logic
PostgreSQL transactions for consistency

Key Design Decisions
Used transactions for coin safety
Enforced single active wheel constraint
Used DB-level constraints for integrity
Worker-based elimination system

Edge Cases Handled
Multiple users joining simultaneously
Insufficient participants → auto abort
Duplicate joins prevented
Race conditions avoided using transactions

Future Improvements
UI wheel animation
Authentication system
Redis for scaling
Horizontal scaling support


