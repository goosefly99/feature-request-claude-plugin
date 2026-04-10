# feature-request-claude-plugin

MCP tool for agents to record feature suggestions into `feature_requests.toml` files.

## What it does

This plugin registers a single MCP tool, `feature_request`, that lets an agent
append a structured feature suggestion into a `feature_requests.toml` file at a
target directory. If no such file exists it is created; otherwise the new entry
is appended under the `[[feature_request]]` table array.

Each entry is assigned a generated id, a UTC timestamp, and a `proposed` status,
so downstream reviewing agents can inspect the TOML store when designing update
specs.

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

| Name               | Required | Type   | Notes                                                                |
| ------------------ | -------- | ------ | -------------------------------------------------------------------- |
| `target_directory` | yes      | string | Absolute path to an existing directory where the TOML file will live |
| `title`            | yes      | string | Short name for the feature (1-200 chars)                             |
| `description`      | yes      | string | What the feature does and why it is useful (1-2000 chars)            |
| `priority`         | yes      | enum   | One of `low`, `medium`, `high`                                       |
| `scope`            | yes      | string | Part of the codebase affected (file, module, or directory)           |
| `rationale`        | yes      | string | Why the agent believes the feature is worth adding (1-2000 chars)    |
| `source`           | no       | string | Identifier for the requesting agent or process                       |

The tool returns the written file path and the generated entry id on success.

## License

Released under the MIT License. See [LICENSE](LICENSE) for the full text.
