# Vaultly – Smart Purchase, Invoice, Warranty & Return Management System

A modern, minimal, full-stack web application designed for students and professionals to track products, purchase invoices, warranties, returns, and repair history in one unified dashboard.

## 👥 Major Project Team Division
- **Member 1 (Core & Foundation)**: Project setup, Authentication, Shared SQLite database, Product management CRUD, Dashboard & Analytics, DSA sorting & search algorithms.
- **Member 2 (Invoices & Documents)**: Invoice upload, OCR parsing, document preview, duplicate invoice detection, CSV export.
- **Member 3 (Warranties & Services)**: Warranty management, return-window tracking, repair/service records, expiry reminders.

## 🛠️ Technology Stack
- **Frontend**: React (Vite), HTML5, CSS3, JavaScript (Fetch API, React Router DOM)
- **Backend**: Node.js (Express 5) + Prisma ORM + SQLite — `backend-node/` (current, Member 2 migration)
- **Backend (legacy reference)**: Python 3 standard library (`http.server`, `sqlite3`) — `backend/` kept until the team confirms removal
- **Database**: SQLite 3 (`database/vaultly.db`, shared by both backends) with strict foreign-key cascades
- **Academic Concepts**: DSA & ADA (Merge Sort, Linear Search, Hash Map / Dictionary Lookups — hand-written in both `products.py` and `backend-node/src/dsa.js`)

## 🚀 Getting Started

### 1. Prerequisites
- Node.js 18+ and npm

### 2. Run the Backend (Port 8000)
```bash
cd backend-node
npm install
npx prisma db push   # creates/updates database/vaultly.db from prisma/schema.prisma
npm start
```

### 3. Run the Backend Tests
```bash
cd backend-node
npm test   # 36 end-to-end checks (auth, products, DSA, invoice upload security, CRUD, dashboard)
```

### 4. Run the Frontend (Port 5173)
```bash
cd frontend
npm install
npm run dev
```

Visit [http://localhost:5173](http://localhost:5173) in your browser.
