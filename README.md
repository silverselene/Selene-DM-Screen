# Summary
A full-screen, browser-based Dungeon Master dashboard for D&D 5.5e (2024). Built with a Midnight & Amethyst theme, it puts every tool a DM needs — initiative tracking, spell lookup, monster stats, random generators and more — into a single configurable interface.

# **Features**
Configurable Widget Grid
Arrange the screen as a 2–4 column × 2–4 row grid. Each cell can hold any widget. Open, close and rearrange widgets freely; recent widgets are saved in the sidebar for quick restore. Layout persists across sessions via localStorage.

# **Seven Widgets**
- _Compendium	Rules reference_ — search and browse D&D 5.5e rules and homebrew entries stored in the database  <br> 
- _Initiative Tracker_ - Add players and monsters, roll initiative, track HP and AC round by round. Clicking a monster name jumps straight to its Bestiary entry  <br> 
- _Notepad_	- Free-text session notes, persisted in localStorage  <br> 
- _Oracle_ - Random generator with four tabs: Names (by ancestry/race), Places (7 settlement types with combinatorial name patterns and descriptors), Loot (by CR tier) and Items (mundane & common magic)  <br> 
- _Bestiary_ - Full-text monster search against a PostgreSQL database. Shows stat blocks, traits, actions and CR-coloured badges  <br> 
- _Wizard's Tome_	 - Searchable spell compendium (557 spells). Filter by level, class, school or Party spells — one click shows only spells your characters know, with character-name pills on every matching row  <br> 
- _Party_ - Full CRUD for player characters. Tracks name, race, class, level, AC, HP, weapons (with live autocomplete against 250 weapons) and spells. One-click dispatch to the Initiative Tracker  <br> 

# **Quality-of-life**
- Light / Dark mode toggle — a full light theme using lavender and ink tones with all contrast issues corrected  <br> 
- Collapsible sidebar — grid size controls, recent widget restore  <br> 
- Cross-widget events — Party → Initiative (add character), Initiative → Bestiary (view monster) via DOM custom events  <br> 


# Stack
pnpm monorepo <br> 
├── artifacts/dm-screen      React 18 + Vite + Tailwind v4 (CSS-first)  <br> 
└── artifacts/api-server     Express 5 + node-postgres  <br> 

# Table	Contents
spells	557 unique spells sourced from 5etools (name, level, school, classes, components, description, upcast)  <br> 
weapons	250 weapons (name, damage dice, damage type, properties, weight, cost)  <br> 
monsters	Monster stat blocks (name, CR, type, AC, HP, traits, actions)  <br> 
player_characters	Party roster — weapons and spells stored as JSONB arrays  <br> 
rules	Compendium rule entries <br> 
homebrew	Custom homebrew entries <br> 

# API Endpoints
GET    /api/health <br> 
GET    /api/monsters/search?q=&limit= <br> 
GET    /api/monsters/:id <br> 
GET    /api/characters <br> 
POST   /api/characters <br> 
PUT    /api/characters/:id <br> 
DELETE /api/characters/:id <br> 
GET    /api/weapons <br> 
GET    /api/weapons/search?q=&limit= <br> 
POST   /api/weapons/by-names <br> 

# Getting Started
Prerequisites <br> 
Node.js 20+ <br> 
pnpm 9+ <br> 
PostgreSQL database (connection string in DATABASE_URL) <br> 
# Install & run <br> 
# Install all workspace dependencies  <br> 
pnpm install  <br> 
# Start both the API server and the frontend in parallel <br> 
pnpm --filter @workspace/api-server run dev   # http://localhost:8080 <br> 
pnpm --filter @workspace/dm-screen run dev    # http://localhost:<PORT> <br> 

# Environment variables <br> 
Variable	Description <br> 
DATABASE_URL	PostgreSQL connection string <br> 
PORT	Port the frontend dev server binds to (injected automatically in Replit) <br> 
Seeding the database <br> 
Import scripts for spells and weapons are in artifacts/api-server/scripts/: <br> 

node artifacts/api-server/scripts/import-spells.mjs <br> 
node artifacts/api-server/scripts/import-weapons.mjs <br> 
