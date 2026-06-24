# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

**Shiftmake** is a browser-based turn-based strategy game with light pixel art graphics. The design documents are in `design documents/Overview.md`, `design documents/Unit details.md`, `design documents/Battle details.md`, `design documents/Overworld.md`, and `design documents/Rifts.md`. The full technical spec is in `TECHNICAL.md` - read it before writing any code. After implementing any changes that contradict one of the markdown documents, update those documents.

### Core Concept

The player commands a patchwork army of multiple races. **Rifts** (portals to new worlds) open periodically - the player chooses which troops to send through each Rift, knowing the VP reward, mutators, and enemy composition in advance. By default, only one troop per race and one troop per troop class can enter a Rift at a time.

Battles are auto-resolved but fully observable (the player can replay exactly how they played out). Skill expression comes from resource efficiency and building synergies.

### Key Game Loops

1. **Strategic layer**: Select which troop to send into each available Rift, balancing risk vs. VP reward, mutators, enemy composition, and race availability.
2. **Progression layer**: Spend Essence on combined troop-and-upgrade drafts, scheduled race unlocks, and global race or troop-class upgrades.
3. **Battle layer**: Auto-resolved; both victories and defeats make troops ready next cycle by default. Units do not permanently die.

### Race & Unit System

- **Races** (e.g., Elves, Trolls) each have default recruitable unit classes.
- **Troops** are race-and-unit-class groups (e.g., Elven Archers, Troll Berserkers).
- Rifts can unlock unorthodox race+unit combinations not available through normal recruitment.
- Upgrades apply either across all units in a race, or across all races for a given unit class.

### Platform Targets

- **Primary**: Browser (web)
- **Implemented adjacent platform work**: Multiplayer support
- **Future platform work not started**: Android/iOS ports

## Stack

TypeScript + Vite + Svelte + PixiJS. See `TECHNICAL.md` for full rationale and conventions.

## Build Commands

```bash
npm install
npm run dev       # Vite dev server
npm run build     # Production build
npm run test      # Vitest (engine unit tests)
npm run preview   # Preview production build
```

On Windows, use `npm.cmd` rather than bare `npm` with PowerShell `Start-Process`; otherwise `npm.ps1` may open in an editor instead of starting the server.

## Critical Architecture Rule

`src/engine/` is pure TypeScript with zero rendering or DOM dependencies. All game logic lives here. Svelte components and PixiJS code must never contain game logic. See `TECHNICAL.md` for the full architecture.
