# 🎓 UniSwap

> Smart Student Marketplace & Rental Platform

UniSwap is a web-based e-commerce platform designed exclusively for university students. It enables students to securely buy, sell, rent, and exchange academic and personal items within their university community.

---

## 📌 Project Overview

Many university students struggle to find affordable textbooks, laptops, calculators, and other educational resources. Existing e-commerce platforms are not designed specifically for students, making transactions less secure and less convenient.

UniSwap provides a trusted marketplace where only verified university students can trade products safely.

---

## ✨ Features

### 👤 User Authentication
- Student Registration
- Login & Logout
- University Email Verification
- Password Reset

### 📦 Product Management
- Add Products
- Update Products
- Delete Products
- Product Categories
- Product Search
- Product Images

### 🛒 Shopping Cart
- Add to Cart
- Remove from Cart
- Update Quantity
- Wishlist

### 📑 Order Management
- Checkout
- Order History
- Order Status
- Cancel Orders

### 💳 Payment Module
- Online Payment
- Cash on Delivery / Pickup
- Payment Confirmation

### 🚚 Delivery Tracking
- Delivery Status
- Pickup Scheduling
- Order Tracking

### ⭐ Review & Rating
- Product Reviews
- Seller Ratings
- Customer Feedback

### 🔔 Notification System
- Order Notifications
- Payment Notifications
- Delivery Updates

### 📊 Admin Dashboard
- User Management
- Product Management
- Order Management
- Category Management
- Reports & Analytics

### 🎯 Recommendation System
(Rule-Based)
- Similar Products
- Top Rated Products
- Most Popular Products
- Recently Added Products
- Recently Viewed Products

---

# 🛠 Technology Stack

## Frontend

- React.js
- Tailwind CSS
- Axios

## Backend

- FastAPI
- Python

## Database

- Supabase PostgreSQL

## Authentication

- JWT
- Argon2 password hashing (planned)

## Tools

- GitHub
- Postman
- VS Code
- Supabase Dashboard

---

# 📂 Project Structure

```
UniSwap
│
├── frontend
│   ├── public
│   ├── src
│   │   ├── pages
│   │   ├── components
│   │   ├── services
│   │   └── assets
│   └── package.json
│
├── backend
│   ├── app
│   │   ├── routes
│   │   ├── models
│   │   ├── database
│   │   ├── services
│   │   ├── utils
│   │   └── main.py
│   └── requirements.txt
│
├── docs
│
├── README.md
│
└── .gitignore
```

---

# 🗄 Database Tables

- users
- products
- categories
- shopping_cart
- orders
- order_items
- payments
- deliveries
- reviews
- notifications
- recommendations

> Member 1 owns authentication and notification-related tables only. Product, cart,
> order, payment, delivery, review, admin, and recommendation tables are listed for
> team planning and should be implemented by their assigned members.

---

# 👥 Team Responsibilities

The detailed Member 1 ownership and integration contract is documented in
[`docs/member1-auth-notifications.md`](docs/member1-auth-notifications.md).

## Member 1

### User Authentication
- Register
- Login
- JWT Authentication
- Password Reset

### Notification System
- Email Notifications
- In-App Notifications

---

## Member 2

### Product Management
- Product CRUD
- Categories
- Product Images
- Search

### Review & Rating
- Ratings
- Reviews

---

## Member 3

### Shopping Cart
- Cart
- Wishlist
- Checkout

### Order Management
- Orders
- Order History
- Order Tracking

---

## Member 4

### Payment Module
- Payment Gateway
- Payment Verification

### Delivery Tracking
- Delivery Status
- Pickup Scheduling

---

## Member 5

### Admin Dashboard
- User Management
- Product Management
- Reports
- Analytics

### Recommendation System
- Similar Products
- Popular Products
- Top Rated Products

---

# 🌿 Git Branches

| Branch | Description |
|----------|-------------|
| main | Stable Production |
| develop | Integration Branch |
| feature/authentication | Member 1 |
| feature/products | Member 2 |
| feature/orders | Member 3 |
| feature/payment-delivery | Member 4 |
| feature/admin-dashboard | Member 5 |

---

# 🚀 Getting Started

## Quick Start

From the project root, run:

```bash
chmod +x run.sh
./run.sh
```

This removes common caches, installs backend and frontend dependencies, creates
`.env` from `.env.example` when needed, and starts both development servers.
Update `.env` with a valid database URL and JWT secret before using the backend.

Useful commands:

```bash
./run.sh clean    # remove caches and frontend build output
./run.sh install  # install dependencies only
./run.sh start    # start both servers
```

## Clone Repository

```bash
git clone https://github.com/YOUR_USERNAME/UniSwap-AI.git
```

---

## Backend Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements-dev.txt

cp .env.example .env

cd backend
uvicorn app.main:app --reload --port 8000
```

Backend runs on

```
http://localhost:8000
```

---

## Frontend Setup

```bash
cd frontend

npm install

npm run dev
```

Frontend runs on

```
http://localhost:5173
```

## Tests

```bash
cd backend
../.venv/bin/pytest -q

cd ../frontend
npm test
npm run build
```

---

# 🔀 Git Workflow

Create your branch

```bash
git checkout -b feature/module-name
```

Commit changes

```bash
git add .

git commit -m "Completed Product CRUD"
```

Push changes

```bash
git push origin feature/module-name
```

Create a Pull Request and merge into **develop** after review.

---

# 📅 Development Timeline

| Week | Task |
|------|------|
| 1 | Requirements & UI Design |
| 2 | Database Design & Authentication |
| 3 | Product Management |
| 4 | Shopping Cart & Orders |
| 5 | Payment & Delivery |
| 6 | Reviews & Notifications |
| 7 | Admin Dashboard |
| 8 | Testing & Bug Fixes |
| 9 | Final Integration |
| 10 | Documentation & Presentation |

---

# 📄 License

This project is developed for educational purposes as part of the **E-Commerce Platform Development** course.

---

# 👨‍💻 Developed By

**UniSwap Development Team**

Faculty of Information Technology

2026
