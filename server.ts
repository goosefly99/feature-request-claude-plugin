#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import TOML from '@iarna/toml'

// ── Constants ─────────────────────────────────────────────────────

const FILENAME = 'feature_requests.toml'
const TABLE_KEY = 'feature_request'

// ── TOML store helpers ────────────────────────────────────────────

interface FeatureEntry {
  id: string
  title: string
  description: string
  priority: string
  scope: string
  rationale: string
  status: string
  timestamp: string
  source: string
}

function readExisting(directory: string): FeatureEntry[] {
  const filepath = path.join(directory, FILENAME)
  if (!fs.existsSync(filepath)) return []

  const raw = fs.readFileSync(filepath, 'utf-8')
  let data: TOML.JsonMap
  try {
    data = TOML.parse(raw)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(
      `Existing ${FILENAME} in ${directory} is malformed and cannot be parsed. ` +
      `Fix or remove it before adding new entries.\n  Error: ${msg}`,
    )
  }

  const entries = data[TABLE_KEY]
  if (!entries) return []
  if (!Array.isArray(entries)) return []
  return (entries as unknown) as FeatureEntry[]
}

function appendEntry(directory: string, entry: FeatureEntry): string {
  const existing = readExisting(directory)
  existing.push(entry)

  const filepath = path.join(directory, FILENAME)
  // Cast through unknown to satisfy @iarna/toml's strict AnyJson constraint
  const data = { [TABLE_KEY]: existing } as unknown as TOML.JsonMap
  fs.writeFileSync(filepath, TOML.stringify(data), 'utf-8')
  return path.resolve(filepath)
}

// ── ID generator ──────────────────────────────────────────────────

function generateId(): string {
  const now = new Date()
  const datePart =
    now.getUTCFullYear().toString() +
    String(now.getUTCMonth() + 1).padStart(2, '0') +
    String(now.getUTCDate()).padStart(2, '0')
  const hexPart = crypto.randomBytes(3).toString('hex')
  return `fr-${datePart}-${hexPart}`
}

// ── Server setup ──────────────────────────────────────────────────

const server = new Server(
  { name: 'feature-request', version: '0.1.0' },
  {
    capabilities: { tools: {} },
    instructions: [
      'Feature request recording server.',
      'Use feature_request to append a structured feature suggestion',
      'into a feature_requests.toml file in any target directory.',
      'These files allow reviewing agents to consider proposed features',
      'when designing update specs.',
    ].join(' '),
  },
)

// ── Tool definitions ──────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'feature_request',
      description:
        'Record a feature suggestion into a feature_requests.toml file. ' +
        'Appends the entry to an existing file in the target directory, or ' +
        'creates a new one if none exists. These files allow reviewing agents ' +
        'to consider proposed features when designing update specs.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          target_directory: {
            type: 'string',
            description:
              'Absolute path to the directory where feature_requests.toml ' +
              'should be written. Must be an existing directory.',
          },
          title: {
            type: 'string',
            description: 'Short name for the proposed feature.',
            minLength: 1,
            maxLength: 200,
          },
          description: {
            type: 'string',
            description: 'What the feature does and why it is useful.',
            minLength: 1,
            maxLength: 2000,
          },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
            description: 'Priority level: low, medium, or high.',
          },
          scope: {
            type: 'string',
            description:
              'What part of the codebase this feature affects ' +
              '(e.g. a file path, module name, or directory).',
            minLength: 1,
            maxLength: 500,
          },
          rationale: {
            type: 'string',
            description: 'Why the agent believes this feature is worth adding.',
            minLength: 1,
            maxLength: 2000,
          },
          source: {
            type: 'string',
            description: 'Identifier for the requesting agent or process.',
            maxLength: 200,
          },
        },
        required: ['target_directory', 'title', 'description', 'priority', 'scope', 'rationale'],
      },
    },
  ],
}))

// ── Tool handlers ─────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const args = (req.params.arguments ?? {}) as Record<string, unknown>

  try {
    switch (req.params.name) {
      case 'feature_request':
        return handleFeatureRequest(args)
      default:
        return {
          content: [{ type: 'text' as const, text: `Unknown tool: ${req.params.name}` }],
          isError: true,
        }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      content: [{ type: 'text' as const, text: `Error: ${msg}` }],
      isError: true,
    }
  }
})

// ── Handler implementation ────────────────────────────────────────

function handleFeatureRequest(args: Record<string, unknown>) {
  const targetDirectory = args.target_directory as string
  if (!targetDirectory) throw new Error('target_directory is required')

  const title = (args.title as string | undefined)?.trim()
  if (!title) throw new Error('title is required')
  if (title.length > 200) throw new Error('title must be at most 200 characters')

  const description = (args.description as string | undefined)?.trim()
  if (!description) throw new Error('description is required')
  if (description.length > 2000) throw new Error('description must be at most 2000 characters')

  const priority = args.priority as string | undefined
  if (!priority) throw new Error('priority is required')
  if (!['low', 'medium', 'high'].includes(priority)) {
    throw new Error('priority must be one of: low, medium, high')
  }

  const scope = (args.scope as string | undefined)?.trim()
  if (!scope) throw new Error('scope is required')
  if (scope.length > 500) throw new Error('scope must be at most 500 characters')

  const rationale = (args.rationale as string | undefined)?.trim()
  if (!rationale) throw new Error('rationale is required')
  if (rationale.length > 2000) throw new Error('rationale must be at most 2000 characters')

  const source = ((args.source as string | undefined)?.trim() ?? 'agent').slice(0, 200)

  // Resolve and validate directory
  const directory = path.resolve(targetDirectory)
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    return {
      content: [{
        type: 'text' as const,
        text: `Error: target_directory does not exist: ${directory}`,
      }],
    }
  }

  const entry: FeatureEntry = {
    id: generateId(),
    title,
    description,
    priority,
    scope,
    rationale,
    status: 'proposed',
    timestamp: new Date().toISOString(),
    source,
  }

  let filepath: string
  try {
    filepath = appendEntry(directory, entry)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      content: [{ type: 'text' as const, text: `Error: ${msg}` }],
    }
  }

  return {
    content: [{
      type: 'text' as const,
      text: [
        'Feature request recorded.',
        `  ID: ${entry.id}`,
        `  Title: ${entry.title}`,
        `  Priority: ${entry.priority}`,
        `  File: ${filepath}`,
      ].join('\n'),
    }],
  }
}

// ── Transport & lifecycle ─────────────────────────────────────────

const transport = new StdioServerTransport()
await server.connect(transport)

function shutdown() {
  server.close().catch(() => {})
  process.exit(0)
}

process.stdin.on('end', shutdown)
process.stdin.on('close', shutdown)
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
process.on('unhandledRejection', (err: unknown) => {
  process.stderr.write(`Unhandled rejection: ${err}\n`)
})
process.on('uncaughtException', (err: Error) => {
  process.stderr.write(`Uncaught exception: ${err.message}\n`)
  shutdown()
})
