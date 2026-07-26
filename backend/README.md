# Backend

This directory is reserved for the FastAPI application.

Planned responsibilities:

- API authentication and Supabase token validation
- learner profiles and onboarding
- conversations and tutor orchestration
- lesson plans, exercises, vocabulary, and spaced repetition
- speech-to-text and text-to-speech integrations
- progress tracking and analytics

The backend has not been scaffolded yet. Its runtime, dependency management, and
deployment configuration will live entirely inside this directory.

The shared Supabase schema is versioned at the repository root under
`supabase/migrations`, because it is consumed by both the frontend and the
future backend.
