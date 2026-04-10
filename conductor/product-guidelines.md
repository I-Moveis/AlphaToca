# Product Guidelines

## Tone and Voice
- **Friendly & Conversational (WhatsApp):** Interactions on WhatsApp should feel approachable and modern, like a helpful assistant.
- **Concise & Technical (API):** For API consumers and developers, the tone should be direct and technical to ensure clarity and efficiency.

## UX Principles (Backend Perspective)
- **Conversational Efficiency:** The backend must prioritize fast, RAG-powered responses for WhatsApp to maintain a natural dialogue flow.
- **Mobile-Optimized Data:** API endpoints are designed to deliver lightweight, highly relevant data to minimize overhead for the mobile application.
- **Cross-Channel Continuity:** The system provides robust state management to ensure a smooth transition for users moving from WhatsApp to the mobile/web app.

## Backend Architecture & Code Style
- **Modular and Decoupled:** Maintain a strict separation between core business logic, WhatsApp webhooks, and the RAG/AI components.
- **Performant RAG Integration:** Optimize vector queries and LLM interactions to provide sub-second responses on WhatsApp.

## Error Handling & Reliability
- **Short & Technical:** Errors are communicated via standard HTTP status codes with concise, actionable, and machine-readable payloads.
- **Fail-Safe AI:** Implement robust fallbacks for the RAG system to ensure the WhatsApp bot remains helpful even when the AI is uncertain.
