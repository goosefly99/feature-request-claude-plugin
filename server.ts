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

type FeatureCategory = 'new_component' | 'substantial_update'

interface FeatureEntry {
  id: string
  title: string
  category: FeatureCategory
  description: string
  priority: string
  scope: string
  review_context: string
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

const SERVER_INSTRUCTIONS = [
  'Feature request recording server.',
  '',
  'USE feature_request ONLY when actively reviewing or testing an existing project codebase',
  'and you have identified a gap that requires wholly new functionality. Do NOT use this tool',
  'during project design, technical spec authoring, or greenfield planning.',
  '',
  'A VALID feature request must be exactly one of:',
  '  1. new_component       — a new component that adds specific functionality NOT already',
  '                           present anywhere in the project.',
  '  2. substantial_update  — a substantial update that adds significant NEW functionality',
  '                           to an existing component or system (not a tweak or fix).',
  '',
  'A feature request is INVALID and MUST NOT be recorded if it:',
  '  • Suggests edits, tweaks, fixes, or refactors to an existing feature or system.',
  '  • Identifies design flaws or proposes alternative architectural decisions.',
  '  • Identifies missing configurations or configuration values.',
  '  • Identifies missing authorization logic, security gates, or access controls.',
  '  • Would introduce scope-bloat or features peripheral to the project\'s stated purpose.',
  '',
  'If the need you identified falls into any invalid category, DO NOT call this tool.',
  'Report the observation in your review output instead.',
].join('\n')

const server = new Server(
  { name: 'feature-request', version: '0.2.0' },
  {
    capabilities: { tools: {} },
    instructions: SERVER_INSTRUCTIONS,
  },
)

// ── Tool definitions ──────────────────────────────────────────────

const TOOL_DESCRIPTION = [
  'Record a structured feature suggestion into a feature_requests.toml file in a target directory.',
  '',
  'WHEN TO USE:',
  '  Use this tool ONLY while actively reviewing or testing an existing project codebase,',
  '  AND only when you have identified the need for genuinely new functionality that is',
  '  not already present in the project.',
  '',
  'WHEN NOT TO USE:',
  '  • Do NOT use during project design, technical spec authoring, or greenfield planning.',
  '  • Do NOT use to suggest edits, tweaks, refactors, or fixes to existing features/systems.',
  '  • Do NOT use to flag design flaws or propose alternative architectural decisions.',
  '  • Do NOT use to flag missing configurations or configuration values.',
  '  • Do NOT use to flag missing authorization logic, security gates, or access controls.',
  '  • Do NOT use to request peripheral features that would cause project scope-bloat.',
  '  If any of the above apply, report the observation in your review output instead of',
  '  calling this tool. Recording an invalid request can disrupt or break project functionality',
  '  if a downstream reviewing agent acts on it.',
  '',
  'VALID CATEGORIES (exactly one must be chosen):',
  '  1. new_component       — a new component that adds specific functionality NOT already',
  '                           present anywhere in the project.',
  '  2. substantial_update  — a substantial update that adds significant NEW functionality',
  '                           to an existing component or system (not a fix or tweak).',
  '',
  'The entry is appended under the [[feature_request]] table array so that downstream',
  'reviewing agents can consider proposed features when designing update specs.',
].join('\n')

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'feature_request',
      description: TOOL_DESCRIPTION,
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
            description:
              'Short name for the proposed feature. Should clearly name a ' +
              'new component or a substantial new capability, not a fix or edit.',
            minLength: 1,
            maxLength: 200,
          },
          category: {
            type: 'string',
            enum: ['new_component', 'substantial_update'],
            description:
              'The only two valid categories for a feature request. ' +
              '"new_component" = a new component adding specific functionality not ' +
              'already in the project. "substantial_update" = a substantial update ' +
              'adding significant new functionality to an existing component or system. ' +
              'If the request does not clearly fit one of these, do NOT call this tool.',
          },
          description: {
            type: 'string',
            description:
              'What the proposed new functionality does. Describe it as an additive ' +
              'capability, not as a change to or replacement of existing behavior.',
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
              'What part of the codebase this feature would live in ' +
              '(e.g. a file path, module name, or directory). For new_component, ' +
              'this is where the new component would be added. For substantial_update, ' +
              'this is the existing component or system being extended.',
            minLength: 1,
            maxLength: 500,
          },
          review_context: {
            type: 'string',
            description:
              'REQUIRED: The specific review or testing activity during which you ' +
              'identified this need (e.g. "reviewing src/api/auth.ts for the login flow", ' +
              '"running the integration test suite against the ingest pipeline"). ' +
              'Feature requests may only be filed while actively reviewing or testing ' +
              'an existing project codebase — never during design or spec authoring.',
            minLength: 1,
            maxLength: 1000,
          },
          rationale: {
            type: 'string',
            description:
              'Why this is a valid feature request. MUST explicitly confirm that the ' +
              'request adds NEW functionality and is NOT: an edit/fix to an existing ' +
              'feature, a design-flaw observation, an alternative architectural choice, ' +
              'a missing configuration, a missing authorization or security gate, or a ' +
              'scope-bloat addition. If you cannot confirm this cleanly, do NOT call this tool.',
            minLength: 1,
            maxLength: 2000,
          },
          source: {
            type: 'string',
            description: 'Identifier for the requesting agent or process.',
            maxLength: 200,
          },
        },
        required: [
          'target_directory',
          'title',
          'category',
          'description',
          'priority',
          'scope',
          'review_context',
          'rationale',
        ],
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

const VALID_CATEGORIES: readonly FeatureCategory[] = ['new_component', 'substantial_update']

function handleFeatureRequest(args: Record<string, unknown>) {
  const targetDirectory = args.target_directory as string
  if (!targetDirectory) throw new Error('target_directory is required')

  const title = (args.title as string | undefined)?.trim()
  if (!title) throw new Error('title is required')
  if (title.length > 200) throw new Error('title must be at most 200 characters')

  const category = args.category as string | undefined
  if (!category) {
    throw new Error(
      'category is required. Must be one of: new_component, substantial_update. ' +
      'A feature request is only valid for (1) a new component adding specific ' +
      'functionality not already in the project, or (2) a substantial update adding ' +
      'significant new functionality to an existing component or system.',
    )
  }
  if (!VALID_CATEGORIES.includes(category as FeatureCategory)) {
    throw new Error(
      `category must be one of: ${VALID_CATEGORIES.join(', ')}. ` +
      'Requests that are edits, fixes, design-flaw observations, architectural ' +
      'alternatives, missing configurations, missing authorization/security gates, ' +
      'or scope-bloat additions are NOT valid feature requests and must not be recorded.',
    )
  }

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

  const reviewContext = (args.review_context as string | undefined)?.trim()
  if (!reviewContext) {
    throw new Error(
      'review_context is required. Describe the specific review or testing activity ' +
      'during which you identified this need. Feature requests may only be filed while ' +
      'actively reviewing or testing an existing project codebase — never during design ' +
      'or technical spec authoring.',
    )
  }
  if (reviewContext.length > 1000) {
    throw new Error('review_context must be at most 1000 characters')
  }

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
    category: category as FeatureCategory,
    description,
    priority,
    scope,
    review_context: reviewContext,
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
        `  ID:       ${entry.id}`,
        `  Title:    ${entry.title}`,
        `  Category: ${entry.category}`,
        `  Priority: ${entry.priority}`,
        `  File:     ${filepath}`,
        '',
        'Reminder: only record feature requests that propose a NEW component or a ',
        'SUBSTANTIAL new-functionality update, and only while actively reviewing or ',
        'testing an existing codebase. Do not record edits, fixes, design-flaw notes, ',
        'missing configs, missing auth/security gates, or scope-bloat additions.',
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
