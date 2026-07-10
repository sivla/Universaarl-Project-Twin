# Design

Vite owns a development-only read boundary. Dedicated Node adapters read the allowlisted architecture, capability catalog, OpenSpec, Jira, Confluence and Evidence families and expose one normalized JSON projection. Zod validates artifacts, W0/W1 history, evidence-image references, source provenance, gaps, warnings and statistics before delivery.

React never receives an absolute source path. The evidence route accepts only relative PNG paths below the real `evidence/` root, rejects sensitive names, absolute paths, traversal and symlink escape. Git branch, commit, dirty state and read time are sampled on every state read. Malformed or missing families become visible warnings; invalid root configuration becomes an explicit source-offline state. No write endpoint exists.
