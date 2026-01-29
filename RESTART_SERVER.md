# Server Restart Required

## Issue
You're getting "413 Payload Too Large" error because the server is still running with the old configuration.

## Solution
The body size limit has been increased to 50MB in the code, but you need to **restart the server** for changes to take effect.

## How to Restart

### Option 1: Terminal (Recommended)
1. Stop the current server (Ctrl+C in the terminal running the server)
2. Restart with: `npm run dev`

### Option 2: Kill and Restart
```bash
# Kill the process on port 3000
lsof -ti:3000 | xargs kill -9

# Start the server
npm run dev
```

## After Restart
1. Server will start with new 50MB body size limit
2. Try importing your contacts again
3. Should work without "Payload Too Large" error

## What Changed
- `server/index.ts` now has: `app.use(express.json({ limit: '50mb' }))`
- This allows larger payloads for contact imports
- But requires server restart to apply

## Next Steps
1. **Restart your development server**
2. **Try the import again**
3. For large files (>5MB), the streaming import will handle it automatically
