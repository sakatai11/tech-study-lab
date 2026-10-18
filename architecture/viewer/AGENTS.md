# Knowledge Graph viewer

Apply the repository's root AGENTS.md and common review/development rules.

The user selected the second generated design: four dark, colored architecture lanes and a three-column inspector below. Preserve that structure. Use actual extracted nodes, relations, source files, and line numbers instead of invented mock content.

This is a read-only local developer tool. Do not deploy it or expose it beyond loopback as part of ordinary development. Follow architecture/README.md for installation, startup and shutdown.

The user explicitly requested Product Design. Its starter includes `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs`; retain that build compatibility. These files prepare local artifacts and do not grant deployment authorization. App UI belongs in `src/`.
