# Development Environment & Autonomous Permissions Policy

## NPM Autonomous Execution
For this project and development session, automatically execute all necessary `npm` commands without pausing or asking for confirmation:
- **No Confirmation Needed**: Never ask for permission before running npm commands.
- **Allowed Commands**: Automatically execute `npm install`, `npm ci`, `npm update`, `npm uninstall`, `npm run`, `npm exec`, `npx`, `npm audit fix`, `npm test`, and all project scripts.
- **Self-Healing / Diagnostics**: If an npm command fails, diagnose the error and retry with the appropriate fix autonomously when reasonable.
- **Package Manifests**: You may modify `package.json` and `package-lock.json` directly as necessary.
- **File Safety**: Before running commands that could delete or overwrite unrelated user files, stop and ask for confirmation.
- **Routine Dev Operations**: For normal project dependency installations, updates, builds, tests, and npm scripts, proceed completely autonomously.

## Strict Git Guardrail
- **NEVER execute `git push`** without explicitly asking the user for confirmation beforehand.
