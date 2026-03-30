# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## CuteBI Cloud Showcase 🚀

This is the **Cloud Optimized** version of CuteBI, designed for deployment on **Vercel** with a persistent **Supabase/Postgres** backend.

## Cloud Architecture
- **Frontend**: React + Vite (Stateless)
- **Backend**: FastAPI (Serverless Functions)
- **Database**: Postgres (external) via `DATABASE_URL`
- **File Engine**: In-memory DuckDB for preview/upload (reset on idle)

## Deployment Instructions

### 1. Database Setup (Supabase)
- Create a free project on [Supabase](https://supabase.com).
- Go to Project Settings -> Database.
- Copy the **Connection String** (URI). It should look like `postgres://postgres:[password]@[host]:5432/postgres`.

### 2. Vercel Configuration
- Create a new project on Vercel pointed at this repository/folder.
- Add an **Environment Variable**:
  - `DATABASE_URL`: Your Supabase connection string.
- Deploy!

## Local Testing
To test the cloud version locally:
```bash
# 1. Set the env var
$env:DATABASE_URL = "your-supabase-url"

# 2. Start backend
python -m uvicorn backend.main:app --port 8000 --reload

# 3. Start frontend
npm run dev
```

---
*Note: This version is independent of the `cutebi-local` standalone version.*

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
