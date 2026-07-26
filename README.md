# AI Language Tutor

## Overview

AI Language Tutor is an intelligent, multimodal language-learning platform that provides a highly personalized learning experience through natural conversations, real-time feedback, and adaptive study plans.

Unlike traditional language-learning applications that rely on static exercises, the platform acts as a private tutor capable of understanding the learner's strengths, weaknesses, goals, and learning pace. It combines Large Language Models (LLMs), speech recognition, text-to-speech, long-term memory, and autonomous agents to create immersive conversations and continuously adapt the learning experience.

The system supports multiple languages and interaction modes, including text, voice, images, and documents, enabling learners to practice real-world communication scenarios.

## Key Features

- 🎙️ Real-time voice conversations with an AI tutor
- 🗣️ Pronunciation analysis and instant feedback
- ✍️ Grammar, vocabulary, and writing correction
- 🧠 Long-term memory that remembers the learner's progress, mistakes, and preferences
- 📚 Personalized lesson plans generated dynamically
- 📝 Automatic generation of quizzes, exercises, and flashcards
- 🔁 Spaced repetition for vocabulary retention
- 🌍 Role-playing conversations (travel, business, healthcare, restaurants, interviews, etc.)
- 📖 Reading and listening comprehension exercises
- 📈 Learning analytics and progress dashboard
- 🎯 Adaptive difficulty based on learner performance
- 📱 Cross-platform support through Web API and mobile-ready architecture

## Technical Highlights

The platform is designed using a modern AI architecture composed of specialized agents orchestrated through LangGraph.

Core components include:

- Large Language Models (GPT, Qwen, Llama, Claude, etc.)
- Whisper for speech-to-text
- XTTS or ElevenLabs for natural voice synthesis
- LangChain / LangGraph for workflow orchestration
- Vector Database for long-term memory and semantic retrieval
- FastAPI backend
- PostgreSQL for structured data
- Redis for caching
- Docker for containerization
- Optional cloud deployment on AWS

## Intelligent Agents

The system is composed of multiple specialized AI agents, including:

- Conversation Agent
- Pronunciation Coach
- Grammar Reviewer
- Vocabulary Coach
- Lesson Planner
- Exercise Generator
- Progress Analyzer
- Memory Manager

These agents collaborate to deliver contextual, personalized, and continuously improving learning sessions.

## Future Roadmap

- Real-time multilingual voice conversations
- Live translation mode
- AI-generated study plans for proficiency exams (IELTS, TOEFL, DELE, CELI, JLPT, etc.)
- Conversation with AI-generated historical or fictional characters
- Community challenges and leaderboards
- Teacher dashboard
- Classroom mode
- Mobile application
- Offline learning mode
- MCP integration with external educational tools

## Goal

The ultimate goal of AI Language Tutor is to build an AI-powered personal language teacher that feels like interacting with a real human tutor—one that remembers every conversation, understands each learner's objectives, continuously adapts its teaching strategy, and helps users achieve fluency through natural, engaging, and personalized interactions.

## Repository Structure

```text
.
├── backend/          # FastAPI application (planned)
├── frontend/         # Next.js web application
├── infra/terraform/  # Supabase and Cloudflare infrastructure
└── docs/             # Product and screen documentation
```

## Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

The production build is exported to `frontend/out` and is deployable to
Cloudflare Pages.

The frontend requires these public build variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Add the same values as GitHub Actions variables in the `development`
environment. The publishable key is safe to expose in the browser; database
access is protected with Supabase Row Level Security.

## Database migrations

Database changes live under `supabase/migrations`. The Supabase GitHub
integration watches the `main` branch and automatically applies new migrations
to production. Its working directory is `.` because `supabase/` is at the
repository root.

Create a new timestamped migration, validate it locally, commit it, and merge it
to `main`. Do not run `supabase db push` manually while the GitHub integration is
processing the same commit.

The initial migration creates user profiles, persistent onboarding preferences,
automatic profile creation after signup, and per-user RLS policies.

## Deployment

The frontend is deployed to the existing Direct Upload Cloudflare Pages project
by `.github/workflows/deploy-cloudflare-pages.yml`.

The workflow runs on frontend changes pushed to `main` and can also be started
manually. It audits production dependencies, runs lint and type-checking, builds
the static application, and deploys `frontend/out`.

Required GitHub environment configuration:

```text
Environment: development
Secret: CLOUDFLARE_API_TOKEN
Variables: CLOUDFLARE_ACCOUNT_ID
           NEXT_PUBLIC_SUPABASE_URL
           NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

## Infrastructure

```bash
terraform -chdir=infra/terraform init
terraform -chdir=infra/terraform plan
terraform -chdir=infra/terraform apply
```

Sensitive Terraform variables, plans, state files, and local provider data are
ignored by Git.
