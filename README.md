# Project Board

<img width="1362" height="798" alt="Screenshot 2026-03-02 at 3 42 31 am" src="https://github.com/user-attachments/assets/5f89ef8f-5c62-46c8-99db-89f8734ce12a" />


Project Board is a visual project-tracking dashboard for personal software projects. It displays all projects as cards organized into four status columns (Kanban-style) so you can view, move, and manage work at-a-glance.

**Demo screenshot:** Replace `screenshot.png` with a real screenshot for the repo.

## Tech Stack

- ![Next.js](https://img.shields.io/badge/Next.js-000000?logo=next.js&logoColor=white)
- ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
- ![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-06B6D4?logo=tailwind-css&logoColor=white)
- ![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?logo=supabase&logoColor=white)
- ![Yarn](https://img.shields.io/badge/Yarn-2C8EBB?logo=yarn&logoColor=white)

## Features

- **View all projects:** Single-screen dashboard showing all projects as cards.
- **Drag & drop:** Move cards between status columns (Not Started, In Development, Uploading / Deploying, Live / Hosted).
- **Project details:** Each card shows project name, short description, tags/tech stack, and creation date.
- **CRUD via modal:** Add, edit, and delete projects using a modal form.
- **Persistent storage:** All data stored in Supabase (Postgres).
- **Realtime updates:** Clients receive updates via Supabase realtime subscriptions.

## Getting Started

### Prerequisites

- Node.js 18+ installed
- Yarn installed (`npm install -g yarn`)
- Supabase account (for database and auth)

### Clone the repo

```bash
git clone <repo-url>
cd ProjectBoard
```

### Install dependencies

```bash
yarn install
```

### Environment variables

Create a `.env.local` file in the project root and add the following variables:

| Name | Description |
|------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous public key |

Example `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Run the Supabase SQL schema

Open the Supabase SQL editor or run via psql and execute the schema below to create the `projects` table.

```sql
create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  tags text[],
  status int not null default 0, -- 0=Not Started, 1=In Dev, 2=Uploading, 3=Live
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### Start development server

```bash
yarn dev
```

Open http://localhost:3000 to view the app.

## Project Structure (App Router)

Typical layout for a Next.js App Router project used by Project Board:

```
app/
  layout.tsx            # Root layout
  page.tsx              # Home / Kanban board
  api/
    ...                # Server actions / API routes
components/
  Board/                # Kanban board + columns
  Card/                 # Project card
  ProjectModal/         # Add/Edit modal
lib/
  supabaseClient.ts     # Supabase client wrapper
  db.ts                 # Optional DB helpers
public/
  screenshot.png        # Placeholder screenshot
styles/
  globals.css           # Tailwind imports
tsconfig.json
package.json
```

Notes:
- UI built with Tailwind CSS and React components under `components/`.
- Supabase client should be initialized in `lib/supabaseClient.ts` and reused across client/server code.

## Supabase Setup

1. Create a Supabase project at https://app.supabase.com.
2. In the SQL editor run the schema shown above to create the `projects` table.
3. Under Settings → API, copy the `URL` and `anon` key and place them in `.env.local` as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. (Optional) Configure Row Level Security and policies if you enable auth.

## Auth (Email + Password) & Testing

- The app provides client-side email/password signup and signin using the public `anon` key. This keeps the UI simple but does not expose any server-only keys.
- On signup the client will attempt to immediately sign in the user. If your Supabase project requires email confirmation the app will show a friendly message: "Account created — please confirm your email (or enable instant sign-in in Supabase settings)."

Quick manual test

1. Start dev server:

```bash
yarn dev
```

2. Open `http://localhost:3000` and click **Sign in** → **Create account**. Use an email and password (password min 6 chars).
3. If confirmations are disabled you should be signed in immediately and the header will show your email. Click **Sign out** to end the session.

Automated auth test (optional)

You can run a node script to attempt a sign-in using environment variables. Set `TEST_AUTH_EMAIL` and `TEST_AUTH_PASSWORD` and run:

```bash
TEST_AUTH_EMAIL=you@example.com TEST_AUTH_PASSWORD=Secret123 node scripts/auth-test.js
```

Security notes

- Never store or expose the Supabase `service_role` key in client code. The client UI uses only the public `anon` key.
- If you need server-side account creation or to bypass email confirmations, implement a server-only endpoint that uses a `service_role` key stored in server environment variables; return sessions or a secure token from that endpoint. Keep the service role key strictly server-side and protect the endpoint with authentication and rate limiting.
- Consider adding Row Level Security (RLS) policies so each user only accesses their own projects; RLS requires creating a `user_id` column and enforcing policies in Supabase.

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Public anon key for Supabase client |

Keep server-only secrets out of client bundles. For server-side calls you can use a service role key in server-only environment variables (not exposed to the browser).

## Deployment

### Vercel

1. Push your repo to GitHub.
2. Import the project into Vercel.
3. In the Vercel dashboard, add the same environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) to the project settings.
4. Set the build command to `yarn build` and the output directory to `.next` (Vercel defaults work for Next.js).

Notes:
- If you use server-side Supabase keys (service_role), store them as server-only environment variables in Vercel.
- Ensure Realtime and database access rules are configured appropriately in Supabase.

## Contributing

Contributions are welcome.

- Fork the repo and create a branch for your feature: `git checkout -b feat/your-feature`
- Run `yarn install` and `yarn dev` to test locally.
- Open a pull request describing your changes.

Please follow the repository's code style and test any behavior you change.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.
