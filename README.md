# Vaultly – Smart Purchase, Invoice, Warranty & Return Management System

A modern, minimal, full-stack web application designed for students and professionals to track products, purchase invoices, warranties, returns, and repair history in one unified dashboard.

## 👥 Major Project Team Division
- **Member 1 (Core & Foundation)**: Project setup, Authentication, Shared SQLite database, Product management CRUD, Dashboard & Analytics, DSA sorting & search algorithms.
- **Member 2 (Invoices & Documents)**: Invoice upload, OCR parsing, document preview, duplicate invoice detection, CSV export.
- **Member 3 (Warranties & Services)**: Warranty management, return-window tracking, repair/service records, expiry reminders.

## 🛠️ Technology Stack
- **Frontend**: React (Vite), HTML5, CSS3, JavaScript (Fetch API, React Router DOM)
- **Backend**: Python 3 standard library (`http.server`, `sqlite3`, `hashlib`, `secrets`, `json`) — zero external dependencies.
- **Database**: SQLite 3 with strict foreign key constraints.
- **Academic Concepts**: DSA & ADA (Merge Sort, Linear Search, Hash Map / Dictionary Lookups).

## 🚀 Getting Started

### 1. Prerequisites
- Python 3.8+
- Node.js 18+ and npm

### 2. Run the Backend (Port 8000)
```bash
cd backend
python3 server.py
```
*Initializes SQLite database automatically at `database/vaultly.db`.*

### 3. Run the Frontend (Port 5173)
```bash
cd frontend
npm install
npm run dev
```

Visit [http://localhost:5173](http://localhost:5173) in your browser.
