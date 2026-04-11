# feature-request-claude-plugin

MCP tool for agents to record strictly-scoped feature suggestions into
`feature_requests.toml` files while reviewing or testing an existing codebase.

## What it does

This plugin registers a single MCP tool, `feature_request`, that lets an agent
append a structured feature suggestion into a `feature_requests.toml` file at a
target directory. If no such file exists it is created; otherwise the new entry
is appended under the `[[feature_request]]` table array.

Each entry is assigned a generated id, a UTC timestamp, and a `proposed` status,
so downstream reviewing agents can inspect the TOML store when designing update
specs.

The tool is intentionally narrow: it only accepts requests for genuinely new
functionality identified during active review or testing of an existing
codebase. Invalid submissions (edits, fixes, design-flaw notes, missing configs,
missing auth gates, scope-bloat) can disrupt downstream work and must not be
recorded.

## When to use

Use `feature_request` only when all of the following hold:

- You are actively reviewing or testing an existing project codebase.
- You have identified a concrete gap that requires genuinely new functionality.
- The proposed addition fits exactly one of the two valid categories below.

## When NOT to use

Do NOT call `feature_request` — report the observation in your review output
instead — if any of the following apply:

- The request suggests edits, tweaks, refactors, or fixes to an existing
  feature or system.
- The request identifies a design flaw or proposes an alternative architectural
  decision.
- The request identifies a missing configuration or configuration value.
- The request identifies missing authorization logic, security gates, or
  access controls.
- The request would introduce scope-bloat or a feature peripheral to the
  project's stated purpose.
- You are engaged in project design, technical spec authoring, or greenfield
  planning (i.e. not reviewing or testing an existing codebase).

Recording an invalid request can disrupt or break project functionality if a
downstream reviewing agent acts on it.

## Valid categories

Every feature request must declare exactly one `category`:

- `new_component` — a new component that adds specific functionality NOT
  already present anywhere in the project.
- `substantial_update` — a substantial update that adds significant NEW
  functionality to an existing component or system. This is not a tweak,
  refactor, or fix.

If the need you identified does not cleanly fit one of these two categories,
do not call the tool.

## Installation

Install via the Claude Code plugin registry:

```
/plugin install goosefly99/feature-request-claude-plugin
```

Or clone and register manually:

```
git clone https://github.com/goosefly99/feature-request-claude-plugin.git
```

Then reference the clone path from your Claude Code plugin configuration. The
MCP server is started by `start.mjs`, which performs a silent `npm install`
(first run) and then launches `server.ts`.

## Usage

Once installed, the `feature_request` tool is available to agents. It accepts
the following parameters:

| Name               | Required | Type   | Notes                                                                                                                                                                                                                     |
| ------------------ | -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `target_directory` | yes      | string | Absolute path to an existing directory where `feature_requests.toml` will live.                                                                                                                                            |
| `title`            | yes      | string | Short name (1-200 chars) that clearly names a new component or a substantial new capability. Not an edit, fix, or tweak.                                                                                                  |
| `category`         | yes      | enum   | Exactly one of `new_component` or `substantial_update`. See Valid categories above. If the request does not cleanly fit one, do NOT call this tool.                                                                        |
| `description`      | yes      | string | What the proposed new functionality does (1-2000 chars). Describe it as an additive capability, not as a change to or replacement of existing behavior.                                                                   |
| `priority`         | yes      | enum   | One of `low`, `medium`, `high`.                                                                                                                                                                                            |
| `scope`            | yes      | string | Where the feature would live (1-500 chars): a file path, module name, or directory. For `new_component`, where the new component would be added. For `substantial_update`, the existing component or system being extended. |
| `review_context`   | yes      | string | The specific review or testing activity during which the need was identified (1-1000 chars). Example: `"reviewing src/api/auth.ts for the login flow"`. Feature requests may only be filed during active review or testing. |
| `rationale`        | yes      | string | Why this is a valid feature request (1-2000 chars). MUST explicitly confirm the request is NOT an edit/fix, design-flaw note, architectural alternative, missing configuration, missing authorization gate, or scope-bloat addition. |
| `source`           | no       | string | Identifier for the requesting agent or process (<=200 chars).                                                                                                                                                              |

The tool returns the written file path and the generated entry id on success.
