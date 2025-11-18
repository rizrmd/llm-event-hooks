# Implementation Plan: LLM Class with Event Hooks

**Branch**: `001-llm-hooks` | **Date**: 2025-11-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-llm-hooks/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Create a TypeScript LLM class with OpenAI Agent SDK integration that provides extensible event hooking system for messages, streaming chunks, and tool execution. The class will manage conversation history in-memory with optional persistence, support configurable stream buffering, and provide a hybrid tool loop approach with developer override capabilities.

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: TypeScript with Bun runtime
**Primary Dependencies**: @openai/agents (latest stable), zod@3, Node.js EventEmitter
**Storage**: In-memory with configurable persistence interface (JSON files by default, extensible)
**Testing**: Bun test framework with contract and integration tests
**Target Platform**: Node.js/Bun runtime (Linux server)
**Project Type**: Single library project
**Performance Goals**: <10ms chunk processing latency, 1000+ concurrent hooks, <1ms registration operations
**Constraints**: Thread safety for concurrent processing, configurable buffer sizes, exception isolation
**Scale/Scope**: Library for developer integration, supporting multiple concurrent LLM instances

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### ✅ Constitutional Compliance Verification

**I. Specification-First Development**:
- ✅ Complete specification exists with prioritized user stories
- ✅ Clear acceptance criteria and measurable success outcomes
- ✅ No code implementation without approved spec

**II. Independent User Stories**:
- ✅ 3 user stories with P1/P2 priorities
- ✅ Each story independently testable and deliverable:
  - US1: Basic message hooks (P1) - standalone logging/monitoring
  - US2: Stream chunk hooks (P1) - standalone real-time processing
  - US3: Tool execution hooks (P2) - standalone tool monitoring
- ✅ Minimal dependencies between stories

**III. Test-First Discipline**:
- ✅ Contract tests will define LLM class interfaces
- ✅ Integration tests will verify user journeys
- ✅ Unit tests will validate hook execution
- ✅ Red-Green-Refactor cycle planned for implementation

**IV. Foundation Before Features**:
- ✅ Phase 1: Hook registration system (foundational)
- ✅ Phase 2: Event processing engine (foundational)
- ✅ Phase 3: Individual story implementations

**V. Incremental MVP Delivery**:
- ✅ US1 (P1) delivers standalone message hooking capability
- ✅ US2 (P1) adds streaming without breaking US1
- ✅ US3 (P2) adds tool monitoring independently

**GATE STATUS**: ✅ PASSED - Proceeding to Phase 0 research

---

## Phase 1 Complete - Constitution Re-Check

### ✅ Constitutional Compliance Verification (Post-Design)

**I. Specification-First Development**:
- ✅ Specification complete with detailed technical design
- ✅ Research phase resolved all technical unknowns
- ✅ Data model, API contracts, and quickstart guide created

**II. Independent User Stories**:
- ✅ User Story 1 (Message hooks): Standalone foundation with HookManager and EventEmitter
- ✅ User Story 2 (Stream hooks): Independent StreamBuffer system with configurable flushing
- ✅ User Story 3 (Tool hooks): Separate ToolManager and ToolLoop components
- ✅ Each story has clear implementation phases and independent testing

**III. Test-First Discipline**:
- ✅ Contract tests defined for all public APIs in `tests/contract/`
- ✅ Integration tests designed for user journey validation in `tests/integration/`
- ✅ Unit tests planned for all components in `tests/unit/`
- ✅ Bun test framework integrated for comprehensive coverage

**IV. Foundation Before Features**:
- ✅ Foundation components clearly defined:
  - Phase 1: HookableLLM core class and HookManager
  - Phase 2: Event system and StreamBuffer infrastructure
  - Phase 3: Individual user story implementations
- ✅ Dependencies resolved: @openai/agents, zod@3, EventEmitter
- ✅ Persistence layer designed with abstraction for flexibility

**V. Incremental MVP Delivery**:
- ✅ US1 delivers complete message hooking capability
- ✅ US2 adds streaming without breaking existing functionality
- ✅ US3 provides tool monitoring as independent enhancement
- ✅ Each story can be deployed and demonstrated independently

**Architecture Decisions**:
- ✅ Modular single-library design supports independent development
- ✅ Event-driven architecture with EventEmitter provides clean separation
- ✅ Configurable persistence and buffering support future extensibility
- ✅ Type safety maintained throughout with TypeScript interfaces

**PHASE 1 GATE STATUS**: ✅ PASSED - Ready for task generation and implementation

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
src/
├── core/
│   ├── HookableLLM.ts
│   ├── HookManager.ts
│   └── EventEmitter.ts
├── events/
│   ├── types.ts
│   ├── MessageEvent.ts
│   ├── ChunkEvent.ts
│   ├── ToolEvent.ts
│   └── BufferEvent.ts
├── streaming/
│   ├── StreamBuffer.ts
│   └── BufferManager.ts
├── tools/
│   ├── ToolManager.ts
│   └── ToolLoop.ts
├── persistence/
│   ├── PersistenceAdapter.ts
│   ├── JSONFilePersistence.ts
│   └── InMemoryPersistence.ts
├── types/
│   └── index.ts
└── index.ts

tests/
├── contract/
│   ├── HookableLLM.test.ts
│   ├── HookManager.test.ts
│   └── EventInterfaces.test.ts
├── integration/
│   ├── MessageHooks.test.ts
│   ├── StreamingHooks.test.ts
│   ├── ToolHooks.test.ts
│   └── Persistence.test.ts
└── unit/
    ├── HookManager.unit.test.ts
    ├── StreamBuffer.unit.test.ts
    ├── ToolManager.unit.test.ts
    └── Persistence.unit.test.ts

examples/
├── basic/
├── streaming/
├── tools/
└── persistence/

docs/
├── api/
└── guides/

**Structure Decision**: Single library project with modular architecture. Core LLM functionality in `src/core/`, event system in `src/events/`, streaming support in `src/streaming/`, tool management in `src/tools/`, and persistence layer in `src/persistence/`. Comprehensive test suite with contract, integration, and unit tests.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
