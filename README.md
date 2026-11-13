# Grand-Lumen

Grand-Lumen is the expanded evolution of Lumen: a modular digital workspace for search, research, learning, coding, visual discovery, open-data tools and personal projects.

Lumen remains a separate project and is not modified by this repository.

## Direction

Grand-Lumen aims to preserve the useful experiences established in Lumen while expanding the platform through a modern multi-language architecture.

## Current foundation

- Search across Wikipedia and Hacker News with results displayed in the workspace
- Research notebook and source discovery
- Visual discovery categories and video search entry point
- Multi-language Code Lab with HTML preview
- Learning paths for web, programming and data fundamentals
- API Library with 20 catalogued services
- Live utilities for weather, currency, dictionary, Pokémon and public holidays
- Saved discoveries and personal project list
- Dark and light themes
- Responsive layout and a familiar Lumen-style loading screen

## Technology

- React and TypeScript
- Vite
- CSS
- Node.js toolchain
- Python service layer planned for research and data processing
- PostgreSQL and Supabase planned for account and synchronised workspace data
- Rust and WebAssembly reserved for performance-sensitive capabilities

## Development

```bash
npm install
npm run dev
```

Create a production build:

```bash
npm run build
npm run preview
```

## Deployment

The repository includes a GitHub Pages workflow. The production base path is configured for the `Grand-Lumen` repository.

## Important implementation notes

Some providers require API keys and are catalogued but not yet connected. Native execution of Python, C, Java, Rust and other non-browser languages requires a secure execution service; the Code Lab currently provides language starters and a safe HTML/JavaScript preview. Research outputs should be verified against original sources.

## Project boundary

The original Lumen repository is intentionally left untouched. All new development belongs in Grand-Lumen.

## Maintainer

Emmanuel Pobee Okpoti
