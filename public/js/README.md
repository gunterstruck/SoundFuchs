# Legacy JavaScript Files

This folder contains legacy JavaScript files from the old implementation.

## Files

- **theme-bootstrap.js** - ✅ **STILL IN USE** - Loads theme before render to prevent flash
- **app.js** - ❌ **DEPRECATED** - Replaced by TypeScript implementation in `src/main.ts`

## Migration Status

The app has been migrated to TypeScript. All functionality from `app.js` has been reimplemented in:

- `src/main.ts` - Main application entry point
- `src/ui/router.ts` - UI phase routing
- `src/ui/phases/*.ts` - Phase implementations
- `src/core/` - Core algorithms (DSP, ML)
- `src/data/` - Database layer

## What to Keep

- ✅ `theme-bootstrap.js` - Required for theme initialization
- ❌ `app.js` - Can be deleted (no longer referenced)

## Cleanup Completed

✅ index.html now loads `/src/main.ts` instead of `js/app.js`
