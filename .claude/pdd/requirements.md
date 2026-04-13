# Requirements

## Problem Statement

A developer who has written a CDK application wants to see a diagram of what infrastructure components exist and how they connect — without drawing it by hand. AWS CDK's `cdk synth` produces a `tree.json` file that describes the full construct tree, but this tree contains far more detail than is useful for an architecture overview. This tool transforms that tree into a clean, readable architecture diagram by applying configurable rules that decide which CDK nodes matter and how they relate.

---

## Functional Requirements

FR-1: The system must accept a `tree.json` file path as a CLI argument and produce an architecture diagram as output.

FR-2: The system must parse the CDK construct tree from a `tree.json` file as produced by `cdk synth` (CDK v2 format). If the file is from an unsupported CDK version or format, the system must fail with a clear diagnostic rather than silently producing incorrect output.

FR-3: The system must apply a set of configurable rules to transform the CDK construct tree into an architecture graph.

FR-4: A rule must be able to map a CDK node to an architecture container.

FR-5: A rule must be able to map a CDK node to an edge between two architecture containers.

FR-6: A rule must be able to map a CDK node to metadata on an existing edge.

FR-7: A rule must be able to define a synthetic container that groups other containers by construct type (e.g. grouping all Lambda functions into a "Compute" container). A container may belong to at most one synthetic group.

FR-8: Rules must support a priority mechanism. When multiple rules match the same CDK node, the highest-priority rule determines the primary output (container or edge). All other matching rules at lower priority are treated as metadata producers for that node's output — they do not generate independent containers or edges.

FR-9: The system must output the architecture diagram as an HTML file containing an embedded diagram showing: all architecture containers (with their names and types), all edges between containers (with their labels), and synthetic container groupings.

FR-10: The architecture graph must use the CDK construct tree hierarchy as the default basis for container containment. Rules determine which CDK nodes become visible containers; the relative position of those containers in the CDK tree determines their containment hierarchy in the diagram.

FR-11: The system must allow the user to specify the output file path via a CLI argument. If not specified, the output file must be named after the input file with an `.html` extension, written to the same directory.

FR-12: On successful completion, the system must print a confirmation to the terminal stating the output file path.

FR-13: The system must report a clear error if the input file does not exist, is not valid JSON, or lacks the required top-level structure of a CDK `tree.json` (a `tree` object with a `children` map and `id` field at minimum). For individual nodes with missing or unexpected fields, the system must skip the node with a warning rather than halting.

FR-14: The system must warn to the terminal when a CDK node is encountered that no rule matches, so the user knows the diagram may be incomplete.

FR-15: The system must ship with a default ruleset covering: Lambda functions, SQS queues, IAM roles, and EventSourceMappings. These four construct types represent the worked example that drives the initial design and are sufficient for a complete v1 demonstration.

FR-16: Users must be able to provide their own rules to extend or override the default ruleset. In v1, the rules interface is not a stable public API — it may change between releases without a deprecation notice.

FR-17: All values derived from the input file or rules that are embedded in the HTML output must be sanitised to prevent them from being interpreted as executable script or markup by a browser.

---

## Non-Functional Requirements

NFR-1: Performance — The system must produce output in under 5 seconds for CDK trees with up to 500 nodes on a machine with at least 4 CPU cores, 8 GB RAM, and an SSD, running macOS or Linux.

NFR-2: Extensibility — Adding a new rule must require no changes to any existing source file outside the rules registration point. This must be demonstrable by adding a rule in a test without modifying any core module.

NFR-3: Usability — Error messages must identify the source of the problem (file path, node type, or rule identifier). Corrective suggestions are not required in v1.

---

## Non-Goals

- The system will not support real-time or watch-mode operation — single invocation only.
- The system will not model human users or external actors — it only shows infrastructure components and how they connect.
- The system will not generate CDK code or modify the CDK tree.
- The system will not deploy or synthesize CDK stacks.
- The system will not support CDK tree formats other than `tree.json` from `cdk synth` CDK v2.
- The system will not support multi-stack or cross-stack inputs in a single invocation.
- The system will not validate that the CDK architecture is correct or follows best practices.
- The system will not produce output formats other than HTML with an embedded diagram.
- The system will not produce interactive diagrams — the HTML output is a static rendering only.
- The system will not provide a GUI for editing rules or the architecture graph.
- Port semantics (named access points on containers) are deferred — edges may carry labels and metadata, but named ports are not a v1 requirement.
- The default ruleset will not cover S3, DynamoDB, API Gateway, or other constructs beyond the four listed in FR-15. These can be added via the user rules mechanism (FR-16).

---

## Design Notes

> Implementation assumptions and technology preferences captured during requirements gathering.

- **Language/runtime**: TypeScript / Node.js
- **Diagram renderer**: Mermaid embedded in an HTML file — no external tooling required
- **Rules format**: Not yet decided (JSON/YAML vs TypeScript functions). The decision must be made before implementation. Constraints: rules must be authorable without recompiling the core package; must support conditional matching logic.
- **Graph model**: The architecture graph is a new data structure — not a filtered or decorated view of the CDK tree.
- **C4 inspiration**: Container and relationship concepts borrow from C4 but do not strictly implement the C4 model.
- **Rule matching interface**: Rules match CDK nodes. The matching interface needs to define: which fields can be matched (construct type, path, attributes), what operators are supported, and whether conditions can be composed. This is a design decision.
- **Edge source/target resolution**: FR-5 requires a rule to identify the source and target containers for an edge. CDK nodes do not encode this directly. The resolution strategy (e.g. traverse hierarchy, reference sibling nodes, reference previously produced containers) must be defined in design.
- **Evaluation model**: FR-8 implies a priority-ordered evaluation pass. When multiple rules match a node, lower-priority rules produce metadata rather than primary outputs. Tie-breaking (equal priority, multiple matches) must be specified in design.
- **Synthetic container membership**: A container may belong to at most one synthetic group (FR-7). If multiple synthetic group rules match, the higher-priority rule wins (consistent with FR-8).
- **CDK hierarchy depth**: CDK trees are deeply nested (App → Stack → L3 → L2 → L1). Only nodes that rules identify as containers should be visible in the diagram. The containment hierarchy in the diagram reflects the relative positions of those visible nodes in the CDK tree, not the full CDK nesting depth.
- **HTML sanitisation**: CDK node names, IDs, and labels must be escaped before embedding in HTML/Mermaid to prevent XSS. This applies even though the tool is local-only, as the HTML may be shared or served.
- **CDK v2 targeting**: The tool targets CDK v2 `tree.json` format. CDK v1 compatibility is out of scope. Unknown formats must produce a diagnostic error.
- **Mermaid scale**: Mermaid has rendering limits for large graphs. At 500 nodes, the output may be dense. This should be considered when designing the default rules — the diagram represents architecture-level containers, not every CDK construct.

---

## Feedback Log

**Devil's Advocate — FR-1/FR-11: "Architecture diagram" undefined** — **Applied** — Added FR-9 defining minimum visible content (containers, edges, groupings).

**Devil's Advocate — NFR-1: "Standard developer machine" undefined** — **Applied** — Specified 4 cores, 8 GB RAM, SSD, macOS or Linux.

**Devil's Advocate — Rules format undecided** — **Ignored** — This is a design decision, not a requirements issue. Already captured in Design Notes with constraints the decision must satisfy.

**Devil's Advocate — Priority tie-breaking unspecified** — **Applied** — Added to Design Notes as a required design decision.

**Devil's Advocate — Multiple synthetic group membership** — **Applied** — FR-7 now states a container may belong to at most one synthetic group; Design Notes cover tie-breaking.

**Devil's Advocate — Port semantics untestable** — **Applied** — FR-9 (ports) removed from FRs; deferred to Non-Goals. Port concept moved to Design Notes as future work.

**Devil's Advocate — CDK hierarchy depth** — **Applied** — FR-10 and Design Notes now clarify that only rule-identified containers are visible; containment reflects relative CDK position.

**Devil's Advocate — Partial/malformed nodes not covered** — **Applied** — FR-13 extended to cover missing node fields with skip-and-warn behavior.

**Devil's Advocate — User vs default rules merge semantics** — **Ignored** — Design decision; belongs in the design phase.

**Devil's Advocate — CDK version compatibility** — **Applied** — FR-2 and Design Notes now explicitly target CDK v2 with diagnostic on unknown formats.

**Devil's Advocate — NFR-2 untestable** — **Applied** — Reframed as a concrete behavioral test: adding a rule requires no changes to core modules.

**Devil's Advocate — Mermaid rendering limits at 500 nodes** — **Applied** — Added to Design Notes as a design consideration.

**End User — Diagram content undefined** — **Applied** — FR-9 now lists minimum visible content.

**End User — Success confirmation missing** — **Applied** — Added FR-12 requiring terminal confirmation with output path.

**End User — Export/share formats** — **Ignored** — Already a non-goal. User can screenshot. Out of scope for v1.

**End User — Rules documentation** — **Ignored** — Documentation is out of scope for the requirements phase. Will surface in design/implementation.

**End User — Unmatched nodes warning** — **Applied** — Added FR-14.

**End User — Navigability/zoom** — **Ignored** — Out of scope for v1. Added to Non-Goals (static rendering only).

**End User — Plain language summary** — **Applied** — Added Problem Statement section.

**End User — Progress feedback (spinner)** — **Ignored** — Over-engineering for a CLI tool expected to complete in under 5 seconds.

**End User — Accessibility of HTML output** — **Ignored** — Out of scope for v1. This is a developer tool. Text list of containers can be added later.

**End User — Non-goals in user-facing terms** — **Applied** — "Persons/actors" non-goal rewritten in plain language.

**Security — User rules arbitrary code execution** — **Ignored** — This is a design constraint (bounded rule interface), not a requirements-level concern for a local CLI tool. Design phase must address the rules interface boundary.

**Security — XSS in HTML output** — **Applied** — Added FR-17 requiring sanitisation of embedded values.

**Security — Path traversal on input/output** — **Ignored** — This is a local CLI tool for developers operating on their own files. The attack surface does not warrant path restriction requirements in v1.

**Security — Input size/complexity limits** — **Ignored** — NFR-1 already bounds the tested input size. Hard limits would be over-engineering for v1.

**Security — Sensitive data (ARNs) in output** — **Ignored** — Users generate their own tree.json of their own infrastructure. Not a security concern in scope.

**Security — Error messages echoing input** — **Ignored** — Over-engineering for a local CLI tool.

**Security — Default ruleset integrity** — **Ignored** — Over-engineering for a local developer tool.

**Developer — Output artifact undefined** — **Applied** — FR-9 added (see above).

**Developer — Rule structure undefined** — **Applied** — Added to Design Notes as a required design decision (matching interface).

**Developer — Edge source/target resolution** — **Applied** — Added to Design Notes as a required design decision.

**Developer — FR-6 "existing edge" semantics** — **Applied** — Added to Design Notes (evaluation model).

**Developer — Synthetic container grouping semantics** — **Applied** — FR-7 clarified; Design Notes cover membership and tie-breaking.

**Developer — FR-8 lower-priority rule behavior** — **Applied** — FR-8 now explicitly states lower-priority matching rules become metadata producers.

**Developer — Port semantics declaration** — **Applied** — Ports deferred to Non-Goals.

**Developer — FR-10 tension with "new structure"** — **Applied** — FR-10 clarified: CDK hierarchy is the default containment basis; rules determine which nodes are visible.

**Developer — FR-13 "expected CDK structure" undefined** — **Applied** — FR-13 now specifies minimum structural requirements (tree object, children map, id field).

**Developer — FR-15 mechanism unspecified** — **Ignored** — Design decision.

**Developer — NFR-1 machine baseline** — **Applied** — Already addressed above.

**Developer — NFR-2 "core logic" undefined** — **Applied** — Already addressed above.

**Developer — FR-14 "covering" undefined** — **Applied** — FR-15 (renumbered) now specifies what the default ruleset covers and what it produces (the four constructs that drive the worked example).

**Scope — Port semantics gold plating** — **Applied** — FR-9 (ports) removed; deferred to Non-Goals. Agreed this adds complexity without a concrete v1 use case beyond edge labels.

**Scope — Synthetic containers unbounded** — **Applied** — FR-7 bounded to grouping by construct type with single-group membership constraint.

**Scope — FR-14 default ruleset sprawl** — **Applied** — Narrowed to Lambda, SQS, IAM roles, EventSourceMappings. S3, DynamoDB, API Gateway moved to Non-Goals/backlog.

**Scope — FR-15 implies stable public API** — **Applied** — FR-16 explicitly states the rules interface is not a stable public API in v1.

**Scope — FR-8 + FR-6 multi-pass evaluation** — **Applied** — Added evaluation model to Design Notes.

**Scope — FR-3 "configurable" undefined** — **Applied** — Design Notes updated with constraints the rules format decision must satisfy.

**Scope — NFR-3 corrective suggestions too broad** — **Applied** — NFR-3 narrowed to error source identification only; corrective suggestions deferred.

**Scope — Multi-stack CDK not addressed** — **Applied** — Added to Non-Goals.

**Scope — Interactive diagrams not addressed** — **Applied** — Added to Non-Goals (static rendering only).

**Scope — FR-10 hierarchy depth** — **Applied** — FR-10 and Design Notes clarified.
